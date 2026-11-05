import test from "node:test";
import assert from "node:assert/strict";
import { prepareLevel, LEVELS } from "../js/levels.js";
import { PHYS, createPlayer, findGround, buildSolids } from "../js/sim.js";

test("every level spawn stands on solid ground", () => {
  for (const index of LEVELS.keys()) {
    const level = prepareLevel(index);
    const solids = buildSolids(level);
    const player = createPlayer(level.spawn.x, level.spawn.y, 1);
    player.grounded = true;
    const ground = findGround(player, solids);
    assert.ok(ground, `${level.name} spawn is not supported`);
    assert.equal(player.y + PHYS.H, ground.y, `${level.name} spawn should rest on the surface`);
    for (const door of level.doors || []) {
      for (const id of door.plates) {
        assert.ok(level.plates.some((plate) => plate.id === id), `${level.name} door missing ${id}`);
      }
    }
    for (const id of level.goal?.plates || []) {
      assert.ok(level.plates.some((plate) => plate.id === id), `${level.name} goal missing ${id}`);
    }
    assert.ok(level.echoMax >= 1);
    assert.ok(level.par > 10);
  }
});
