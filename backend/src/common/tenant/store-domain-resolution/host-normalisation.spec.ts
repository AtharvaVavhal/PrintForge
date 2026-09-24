import { normaliseHost, parseStorefrontOrigin } from './host-normalisation';

const prod = { allowLoopback: false, requireHttps: true };
const dev = { allowLoopback: true, requireHttps: false };

/** Phase 9 W3 — spec §4.2 host normalisation and §4.1.2 step 1 (Origin syntax). */
describe('normaliseHost (spec §4.2)', () => {
  it('lowercases, strips a trailing dot, keeps a valid multi-label hostname', () => {
    expect(normaliseHost('Shop-A.Example.', prod)).toBe('shop-a.example');
    expect(normaliseHost('a.stores.printforge.app', prod)).toBe(
      'a.stores.printforge.app',
    );
  });

  it.each([
    '',
    ' ',
    'single-label',
    '-bad.example',
    'bad-.example',
    'ba d.example',
    'a..b',
    '[::1]',
    'host:443',
    'x'.repeat(64) + '.example',
    'a.'.repeat(130) + 'b',
  ])('rejects syntactically invalid host %j', (raw) => {
    expect(normaliseHost(raw, prod)).toBeNull();
    expect(normaliseHost(raw, dev)).toBeNull();
  });

  it('rejects localhost / IPv4 literals in production, accepts them in dev/test', () => {
    for (const raw of ['localhost', 'LOCALHOST.', '127.0.0.1']) {
      expect(normaliseHost(raw, prod)).toBeNull();
      expect(normaliseHost(raw, dev)).not.toBeNull();
    }
  });

  it('rejects non-strings', () => {
    expect(normaliseHost(undefined, dev)).toBeNull();
    expect(normaliseHost(null, dev)).toBeNull();
  });
});

describe('parseStorefrontOrigin (spec §4.1.2 step 1)', () => {
  it('accepts scheme://host[:port] and returns the normalised host without the port', () => {
    expect(parseStorefrontOrigin('https://Shop-A.example:8443', prod)).toEqual({
      scheme: 'https',
      host: 'shop-a.example',
    });
    expect(
      parseStorefrontOrigin('http://a.stores.printforge.test', dev),
    ).toEqual({ scheme: 'http', host: 'a.stores.printforge.test' });
  });

  it.each([
    undefined,
    null,
    '',
    'null',
    'shop-a.example',
    'ftp://shop-a.example',
    'https://shop-a.example/path',
    'https://shop-a.example/',
    'https://shop-a.example?x=1',
    'https://shop-a.example#frag',
    'https://user:pw@shop-a.example',
    'https://[::1]',
    'https://shop-a.example:notaport',
  ])('rejects absent / null / malformed origin %j', (origin) => {
    expect(parseStorefrontOrigin(origin, prod)).toBeNull();
    expect(parseStorefrontOrigin(origin, dev)).toBeNull();
  });

  it('requires https in production, accepts http in dev/test', () => {
    expect(parseStorefrontOrigin('http://shop-a.example', prod)).toBeNull();
    expect(parseStorefrontOrigin('http://shop-a.example', dev)).toEqual({
      scheme: 'http',
      host: 'shop-a.example',
    });
  });

  it('applies the loopback rule through to the host', () => {
    expect(parseStorefrontOrigin('https://localhost', prod)).toBeNull();
    expect(parseStorefrontOrigin('http://localhost:5173', dev)).toEqual({
      scheme: 'http',
      host: 'localhost',
    });
  });
});
