/** Gives the pure-logic tests a browser-like location so share URLs resolve. */
if (typeof globalThis.location === 'undefined') {
  globalThis.location = Object.freeze({
    origin: 'https://play.example.com',
    pathname: '/diwali/',
    href: 'https://play.example.com/diwali/',
    search: ''
  });
}
