/** Tiny zero-dependency test runner (node tests/run.mjs). */

const groups = [];
let only = null;

export function describe(name, fn) { groups.push({ name, tests: [], fn }); }
export function it(name, fn) {
  const g = groups[groups.length - 1];
  if (!g) throw new Error('it() outside describe()');
  g.tests.push({ name, fn });
}
export function itOnly(name, fn) { it(name, fn); only = name; }

export function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}
export function equal(actual, expected, msg) {
  if (actual !== expected) throw new Error(msg || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
export function deepEqual(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(msg || `expected ${b}, got ${a}`);
}
export function close(actual, expected, tol = 1e-6, msg) {
  if (Math.abs(actual - expected) > tol) throw new Error(msg || `expected ~${expected}, got ${actual}`);
}

export async function runAll() {
  let pass = 0, fail = 0;
  for (const group of groups) {
    group.fn();
    console.log(`\n\x1b[1m${group.name}\x1b[0m`);
    for (const t of group.tests) {
      if (only && t.name !== only) continue;
      try {
        await t.fn();
        pass++;
        console.log(`  \x1b[32m✓\x1b[0m ${t.name}`);
      } catch (err) {
        fail++;
        console.log(`  \x1b[31m✗\x1b[0m ${t.name}`);
        console.log(`      ${err.message}`);
        if (process.env.VERBOSE) console.log(err.stack);
      }
    }
  }
  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exitCode = 1;
  return { pass, fail };
}
