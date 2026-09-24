/**
 * Cheap change-detection token for renderer props.
 *
 * Renderer `update()` runs every frame from the runtime's `syncUI`, so the diff
 * has to be cheaper than re-applying the props. Joining primitives beats
 * `JSON.stringify` of a whole object and keeps key order irrelevant.
 */
const separator = '\u0001';

export function buildSignature(values: readonly unknown[]): string {
  let signature = '';

  for (const value of values) {
    if (value === null || value === undefined) {
      signature += '';
    } else if (typeof value === 'object') {
      signature += JSON.stringify(value);
    } else {
      signature += String(value);
    }

    signature += separator;
  }

  return signature;
}
