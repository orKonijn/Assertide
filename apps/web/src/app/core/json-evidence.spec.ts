import { atJsonPointer } from './json-evidence';
describe('recorded JSON pointers', () => {
  it('resolves arrays and escaped keys without exposing prototype values', () => {
    const value = { response: { body: [{ 'a/b~c': false, quantity: 0 }] } };
    expect(atJsonPointer(value, '/response/body/0/a~1b~0c')).toBe(false);
    expect(atJsonPointer(value, '/response/body/0/quantity')).toBe(0);
    expect(atJsonPointer(value, '')).toBe(value);
    expect(() => atJsonPointer(value, '/constructor')).toThrow();
    expect(() => atJsonPointer(value, '/response/body/2')).toThrow();
    expect(() => atJsonPointer(value, '/response/~2')).toThrow();
  });
});
