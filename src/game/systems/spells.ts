// Mage spellcasting: mana, two spells (Fireball, Freeze), and autocast.
import type { World } from "../World.ts";
import type { Unit, Targetable } from "../entities/Unit.ts";
import type { Vec2 } from "../types.ts";
import { TILE } from "../constants.ts";

export type SpellId = "fireball" | "freeze";

export interface SpellDef {
  id: SpellId;
  label: string;
  hotkey: string;
  cost: number;
  cooldown: number; // seconds
  range: number; // tiles (autocast acquisition + UI)
  radius: number; // tiles (area of effect)
  damage?: number; // fireball
  slowDur?: number; // freeze: seconds of chill
}

export const SPELLS: Record<SpellId, SpellDef> = {
  fireball: { id: "fireball", label: "Fireball", hotkey: "R", cost: 45, cooldown: 2.4, range: 6, radius: 2, damage: 20 },
  freeze: { id: "freeze", label: "Freeze", hotkey: "X", cost: 30, cooldown: 2.2, range: 6, radius: 2.6, slowDur: 4 },
};
export const SPELL_LIST: SpellDef[] = [SPELLS.fireball, SPELLS.freeze];

function d2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function canCast(u: Unit, sp: SpellDef): boolean {
  return u.kind === "mage" && !u.dead && u.castCd <= 0 && u.mana >= sp.cost;
}

/** Cast `sp` from `u` at world point `pt`. Returns false if it couldn't fire. */
export function castSpell(world: World, u: Unit, sp: SpellDef, pt: Vec2): boolean {
  if (!canCast(u, sp)) return false;
  u.mana -= sp.cost;
  u.castCd = sp.cooldown;
  u.aim = { ...pt };
  world.events.push({ type: "spell", spell: sp.id, x: pt.x, y: pt.y });
  const r2 = (sp.radius * TILE) ** 2;
  for (const o of world.units) {
    if (o.dead || o.playerId === u.playerId) continue;
    if (d2(o.pos, pt) > r2) continue;
    if (sp.id === "fireball") {
      o.hp -= sp.damage ?? 0;
      o.hitFlash = 0.14;
      world.events.push({ type: "damaged", playerId: o.playerId, x: o.pos.x, y: o.pos.y });
      if (o.hp <= 0 && o.state !== "dead") {
        o.state = "dead";
        u.kills++;
        world.events.push({
          type: "death",
          x: o.pos.x,
          y: o.pos.y,
          color: world.player(o.playerId).color,
          glyph: o.def.glyph,
          by: u.playerId,
        });
      }
    } else {
      o.slowT = Math.max(o.slowT, sp.slowDur ?? 0);
      o.chillFx = sp.slowDur ?? 0;
    }
  }
  // Fireball also scorches enemy buildings in the blast (at reduced effect).
  if (sp.id === "fireball") {
    for (const b of world.buildings) {
      if (b.dead || b.playerId === u.playerId) continue;
      if (d2(b.center(), pt) > r2) continue;
      const wasAlive = b.hp > 0;
      b.hp -= Math.round((sp.damage ?? 0) * 0.6);
      b.hitFlash = 0.14;
      world.events.push({ type: "damaged", playerId: b.playerId, x: b.center().x, y: b.center().y });
      if (b.hp <= 0 && wasAlive) {
        b.hp = 0;
        u.kills++;
        world.events.push({ type: "collapse", x: b.center().x, y: b.center().y, size: b.footprint * 16, by: u.playerId });
      }
    }
  }
  return true;
}

function nearestEnemyInRange(world: World, u: Unit, rangeTiles: number): Unit | null {
  const r2 = (rangeTiles * TILE) ** 2;
  let best: Unit | null = null;
  let bd = Infinity;
  for (const o of world.units) {
    if (o.dead || o.playerId === u.playerId) continue;
    const dd = d2(o.pos, u.pos);
    if (dd <= r2 && dd < bd) {
      bd = dd;
      best = o;
    }
  }
  return best;
}

/** Per-frame: mana regen, cooldown/status decay, and autocast firing. */
export function updateSpells(world: World, dt: number): void {
  for (const u of world.units) {
    if (u.dead) continue;
    if (u.castCd > 0) u.castCd -= dt;
    if (u.slowT > 0) u.slowT -= dt;
    if (u.chillFx > 0) u.chillFx -= dt;
    if (u.def.maxMana) u.mana = Math.min(u.def.maxMana, u.mana + (u.def.manaRegen ?? 0) * dt);
    if (u.kind === "mage" && u.autocast) {
      const sp = SPELLS[u.autocast as SpellId];
      if (sp && canCast(u, sp)) {
        const tgt: Targetable | null = nearestEnemyInRange(world, u, sp.range);
        if (tgt) castSpell(world, u, sp, { ...tgt.pos });
      }
    }
  }
}
