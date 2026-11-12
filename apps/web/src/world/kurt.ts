/**
 * Kurt: sits behind his desk in his own office next to the game corner, buried in paper. Now
 * and then a dev walks in and asks for the Klima ticket or a contract; it is always hard, he
 * is doing this and that, and it will take time.
 */
import { seededRandom } from "@agent-office/protocol";
import type { Container } from "pixi.js";
import { C } from "../art/palette.ts";
import { kurtSheet } from "../art/residents.ts";
import type { Effects } from "./effects.ts";
import { KURT_DESK, type OfficeMap, type Point, TILE } from "./map.ts";
import { type KurtLine, kurtTalk } from "./residentRules.ts";
import { Walker } from "./walker.ts";

const MUTTER = ["THIS AND THAT...", "SO MUCH TO DO.", "WHERE WAS I?", "ONE THING AFTER ANOTHER."];
const CLICKED = ["VERY BUSY.", "THIS AND THAT.", "TAKES TIME.", "LATER, LATER."];
/** seconds between two lines of a visit */
const SAY_GAP = 1.5;

type Talk = { id: string; lines: KurtLine[]; t: number };

export class Kurt {
  readonly walker: Walker;
  private rand = seededRandom("kurt");
  private talk: Talk | null = null;
  private mutterT = 10;
  private talkCooldown = 0;

  constructor(
    objects: Container,
    map: OfficeMap,
    private readonly effects: Effects,
    /** make the visitor (a session character) say something */
    private readonly devSays: (sessionId: string, text: string) => void,
  ) {
    this.walker = new Walker(objects, kurtSheet(), map, effects, this.seat());
    this.walker.pose = "sitFront";
  }

  /** Behind his desk, facing the door. */
  private seat(): Point {
    return { x: (KURT_DESK.x + 1) * TILE, y: KURT_DESK.y * TILE - 3 };
  }

  private pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.rand() * list.length)]!;
  }

  setMap(map: OfficeMap) {
    this.walker.map = map;
  }

  get y() {
    return this.walker.y;
  }
  hit(wx: number, wy: number) {
    return this.walker.hit(wx, wy);
  }
  /** someone is at his desk right now */
  get talking() {
    return this.talk !== null;
  }

  poke() {
    if (this.talkCooldown > 0) return;
    this.talkCooldown = 1.5;
    this.walker.say(this.pick(CLICKED), C.plum);
  }

  /** A dev arrived at his desk and asks for something. */
  asked(sessionId: string) {
    this.talk = { id: sessionId, lines: kurtTalk(this.rand).lines, t: 0.4 };
  }

  private talkStep(talk: Talk, dt: number) {
    talk.t -= dt;
    if (talk.t > 0) return;
    const line = talk.lines.shift();
    if (!line) {
      this.talk = null;
      this.walker.pose = "sitFront";
      this.mutterT = 6 + this.rand() * 6;
      return;
    }
    talk.t = SAY_GAP;
    if (line.who === "dev") {
      this.walker.pose = "sitFront";
      this.devSays(talk.id, line.text);
      return;
    }
    this.walker.say(line.text, C.plum, SAY_GAP + 0.5);
    // "this and that": hands up, papers fly
    this.walker.pose = /THIS|THAT/.test(line.text) ? "raiseHand" : "sitFront";
    if (this.walker.pose === "raiseHand") this.effects.puff(this.walker.x - 10, this.walker.y + 2);
  }

  update(dt: number, time: number) {
    this.talkCooldown -= dt;
    if (this.talk) this.talkStep(this.talk, dt);
    else {
      this.mutterT -= dt;
      if (this.mutterT <= 0) {
        this.mutterT = 12 + this.rand() * 14;
        this.effects.puff(this.walker.x - 10, this.walker.y + 2);
        if (this.rand() < 0.5) this.walker.say(this.pick(MUTTER), C.plum, 2.2);
      }
    }
    this.walker.update(dt, time, 0);
  }
}
