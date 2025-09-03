import assert from 'node:assert/strict'

type Matcher = {
  toBe: (expected: any) => void
  toEqual: (expected: any) => void
  toStrictEqual: (expected: any) => void
  toBeDefined: () => void
  toBeInstanceOf: (ctor: Function) => void
  not: {
    toBe: (expected: any) => void
    toBeInstanceOf: (ctor: Function) => void
  }
}

export function expect(received: any): Matcher {
  return {
    toBe: (expected: any) => assert.strictEqual(received, expected),
    toEqual: (expected: any) => assert.deepEqual(received, expected),
    toStrictEqual: (expected: any) => assert.deepStrictEqual(received, expected),
    toBeDefined: () => assert.notStrictEqual(received, undefined),
    toBeInstanceOf: (ctor: Function) => assert.ok(received instanceof (ctor as any)),
    not: {
      toBe: (expected: any) => assert.notStrictEqual(received, expected),
      toBeInstanceOf: (ctor: Function) => assert.ok(!(received instanceof (ctor as any))),
    },
  }
}

export default expect
