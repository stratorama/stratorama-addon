import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactTokens } from '../src/ha-redact.js';

/**
 * The states below are shaped the way Home Assistant serialises them (home-assistant/core,
 * camera/__init__.py, image/__init__.py, media_player/__init__.py, stream/hls.py, tts/__init__.py,
 * read on 2026-10-02), with the tokens shortened. The relay's twin (stratorama-tunnel,
 * src/ha-redact.spec.ts) runs the same cases.
 */

const CAMERA_TOKEN = '3f9a7c';

function camera() {
  return {
    entity_id: 'camera.porch',
    state: 'idle',
    attributes: {
      access_token: CAMERA_TOKEN,
      model_name: 'G4 Bullet',
      brand: 'Ubiquiti',
      friendly_name: 'Porch',
      entity_picture: `/api/camera_proxy/camera.porch?token=${CAMERA_TOKEN}`,
      supported_features: 2,
    },
    last_changed: '2026-10-02T08:00:00.000000+00:00',
    last_reported: '2026-10-02T08:05:00.000000+00:00',
    last_updated: '2026-10-02T08:05:00.000000+00:00',
    context: { id: '01J', parent_id: null, user_id: null },
  };
}

const inString = (value: string) =>
  (redactTokens({ entity_id: 'sensor.x', state: 'ok', attributes: { value } }) as { attributes: { value: string } })
    .attributes.value;

test('a camera loses its access_token and its token-bearing picture link, and nothing else', () => {
  const original = camera();
  const redacted = redactTokens(original);

  assert.deepEqual(redacted, {
    ...original,
    attributes: {
      model_name: 'G4 Bullet',
      brand: 'Ubiquiti',
      friendly_name: 'Porch',
      supported_features: 2,
    },
  });
  assert.equal(JSON.stringify(redacted).includes(CAMERA_TOKEN), false);
  // Home Assistant's object is copied, not edited.
  assert.deepEqual(original, camera());
});

test('an image entity is redacted the same way', () => {
  assert.deepEqual(
    redactTokens({
      entity_id: 'image.doorbell_snapshot',
      state: '2026-10-02T08:00:00+00:00',
      attributes: {
        access_token: 'abc123',
        friendly_name: 'Doorbell snapshot',
        entity_picture: '/api/image_proxy/image.doorbell_snapshot?token=abc123',
      },
    }),
    {
      entity_id: 'image.doorbell_snapshot',
      state: '2026-10-02T08:00:00+00:00',
      attributes: { friendly_name: 'Doorbell snapshot' },
    },
  );
});

test('a media player loses both picture links, never-rotated token included', () => {
  const redacted = redactTokens({
    entity_id: 'media_player.living_room',
    state: 'playing',
    attributes: {
      media_title: 'Song',
      entity_picture: '/api/media_player_proxy/media_player.living_room?token=d00d&cache=9b1e',
      entity_picture_local: '/api/media_player_proxy/media_player.living_room?token=d00d&cache=9b1e',
      friendly_name: 'Living room',
    },
  }) as { attributes: Record<string, unknown> };
  assert.deepEqual(redacted.attributes, { media_title: 'Song', friendly_name: 'Living room' });
});

test('a camera cast to a media player loses its stream token, which sits in the path', () => {
  // camera.play_stream: media_content_id is <hass> + stream endpoint_url, signed. The path
  // segment is the credential: StreamView is served without authentication.
  const redacted = redactTokens({
    entity_id: 'media_player.kitchen_display',
    state: 'playing',
    attributes: {
      media_content_id: 'http://192.168.1.10:8123/api/hls/9f8e7d6c5b4a3f2e/master_playlist.m3u8?authSig=eyJhbGciOi',
      media_content_type: 'application/vnd.apple.mpegurl',
    },
  }) as { attributes: Record<string, unknown> };
  assert.equal(redacted.attributes['media_content_id'], 'http://192.168.1.10:8123/api/hls/redacted/master_playlist.m3u8');
  assert.equal(redacted.attributes['media_content_type'], 'application/vnd.apple.mpegurl');
});

test('every stream and spoken-message path token goes', () => {
  const cases: Array<[string, string]> = [
    ['/api/hls/9f8e7d6c/playlist.m3u8', '/api/hls/redacted/playlist.m3u8'],
    ['/api/hls/9f8e7d6c/segment/4.0.m4s', '/api/hls/redacted/segment/4.0.m4s'],
    ['/api/tts_proxy/Xb3_kq9VtN2Lm0aPq1rS4w.mp3', '/api/tts_proxy/redacted'],
    ['http://ha.local:8123/api/tts_proxy/Xb3_kq9VtN2Lm0aPq1rS4w.flac', 'http://ha.local:8123/api/tts_proxy/redacted'],
  ];
  for (const [input, expected] of cases) assert.equal(inString(input), expected, input);
});

test('every token-bearing parameter goes, wherever it sits and whatever surrounds it', () => {
  const cases: Array<[string, string]> = [
    ['/api/x?cache=1&token=t', '/api/x?cache=1'],
    ['/api/x?a=1&token=t&b=2', '/api/x?a=1&b=2'],
    ['/api/x?token=t&token=u', '/api/x'],
    ['/api/x?a=1&token=t&token=u&b=2', '/api/x?a=1&b=2'],
    ['/api/x?token=a&token=b&c=1', '/api/x?c=1'],
    ['/api/x?token=a&access_token=b&authSig=c', '/api/x'],
    ['/api/x?token=t#frame', '/api/x#frame'],
    ['https://ha.example.org/api/camera_proxy/camera.porch?token=t', 'https://ha.example.org/api/camera_proxy/camera.porch'],
    // Home Assistant's signed paths, and the OAuth habit some integrations follow.
    ['/media/local/doorbell.mp3?authSig=eyJhbGciOi', '/media/local/doorbell.mp3'],
    ['https://maps.example.com/tile.png?z=3&access_token=pk.123', 'https://maps.example.com/tile.png?z=3'],
    // A URL inside a sentence, a list, a JSON string, after another query.
    ['Snapshot at /api/x?token=t (expires soon)', 'Snapshot at /api/x (expires soon)'],
    ['/api/camera_proxy/camera.a?token=A,/api/camera_proxy/camera.b?token=B', '/api/camera_proxy/camera.a,/api/camera_proxy/camera.b'],
    ['{"url":"/api/x?token=S"}', '{"url":"/api/x"}'],
    ['["/a?x=1","/b?token=S"]', '["/a?x=1","/b"]'],
    ['/api/a?x=1?token=S', '/api/a?x=1'],
    // HTML-escaped separators.
    ['/api/x?a=1&amp;token=S&amp;b=2', '/api/x?a=1&amp;b=2'],
    ['/api/x?token=S&amp;b=2', '/api/x?b=2'],
    ['/api/x?a=1&amp;token=S', '/api/x?a=1'],
  ];
  for (const [input, expected] of cases) assert.equal(inString(input), expected, input);
});

test('credentials of the forwarded domains themselves go: a garage cover, a lock operator, a monitored address', () => {
  // garadget: the maker's cloud token, which opens the door from anywhere.
  assert.deepEqual(
    redactTokens({ entity_id: 'cover.garage', state: 'closed', attributes: { access_token: 'particle-secret', friendly_name: 'Garage' } }),
    { entity_id: 'cover.garage', state: 'closed', attributes: { friendly_name: 'Garage' } },
  );
  // august / yale: a photo of whoever last unlocked the door, on a public CDN.
  assert.deepEqual(
    redactTokens({
      entity_id: 'sensor.front_door_operator',
      state: 'Alice',
      attributes: { entity_picture: 'https://d3osa7xy9vsc0q.cloudfront.net/app/ActivityFeedIcons/alice.jpg', method: 'keypad' },
    }),
    { entity_id: 'sensor.front_door_operator', state: 'Alice', attributes: { method: 'keypad' } },
  );
  // uptimerobot / uptime_kuma: whatever was typed into the monitored address.
  const cases: Array<[string, string]> = [
    ['https://admin:hunter2@status.example.org/health?x=1', 'https://status.example.org/health?x=1'],
    ['rtsp://admin:hunter2@192.168.1.5:554/stream1', 'rtsp://192.168.1.5:554/stream1'],
    ['Cameras: rtsp://a:b@10.0.0.2/s and rtsp://c:d@10.0.0.3/s', 'Cameras: rtsp://10.0.0.2/s and rtsp://10.0.0.3/s'],
  ];
  for (const [input, expected] of cases) assert.equal(inString(input), expected, input);
});

test('a hostile string is handled in linear time, not one pass per match', () => {
  const k = 20_000;
  const chain = '&amp'.repeat(k) + '?token=x' + ';token=y'.repeat(k);
  const runs = '?token=&'.repeat(100_000);
  const started = Date.now();
  inString(chain);
  assert.equal(inString(runs).includes('token='), false);
  // Quadratic, the chain alone takes minutes; linear, a few milliseconds.
  assert.equal(Date.now() - started < 2_000, true, `took ${Date.now() - started} ms`);
});

test('a token held as the state itself goes too', () => {
  // A template sensor whose value is a camera's entity_picture, a real configuration pattern.
  const redacted = redactTokens({
    entity_id: 'sensor.porch_snapshot_url',
    state: 'http://192.168.1.10:8123/api/camera_proxy/camera.porch?token=SECRET',
    attributes: { friendly_name: 'Porch snapshot URL' },
  });
  assert.equal(JSON.stringify(redacted).includes('SECRET'), false);
  assert.equal((redacted as { state: string }).state, 'http://192.168.1.10:8123/api/camera_proxy/camera.porch');
});

test('what only looks like a token is left alone', () => {
  const state = {
    entity_id: 'sensor.x',
    state: 'Is it on? token=no',
    attributes: {
      friendly_name: 'Is the door locked? token=no',
      tokens_left: 3,
      token: 'a key named token is not a query parameter',
      picture: '/api/x?tokens=1&mytoken=2&cache=3',
      icon_url: 'https://brands.home-assistant.io/_/hue/icon.png',
      contact: 'write to a@b.example or see http://host.example/path?email=a@b.example',
      path: '/api/hlsx/abc and /api/tts_proxyx/abc',
      unit_of_measurement: '°C',
    },
  };
  assert.deepEqual(redactTokens(state), state);
});

test('nested attributes are redacted too', () => {
  assert.deepEqual(
    redactTokens({
      entity_id: 'sensor.cameras',
      state: '2',
      attributes: {
        cameras: [
          { name: 'Porch', access_token: 'a', still: '/api/camera_proxy/camera.porch?token=a' },
          { name: 'Garden', links: { live: '/api/camera_proxy_stream/camera.garden?token=b' } },
        ],
      },
    }),
    {
      entity_id: 'sensor.cameras',
      state: '2',
      attributes: {
        cameras: [
          { name: 'Porch', still: '/api/camera_proxy/camera.porch' },
          { name: 'Garden', links: { live: '/api/camera_proxy_stream/camera.garden' } },
        ],
      },
    },
  );
});

test('a hostile depth is cut off instead of overflowing the stack', () => {
  let deep: unknown = 'bottom';
  for (let i = 0; i < 100_000; i++) deep = [deep];
  const redacted = redactTokens({ entity_id: 'sensor.deep', state: 'ok', attributes: { deep } }) as {
    entity_id: string;
    attributes: { deep: unknown };
  };
  assert.equal(redacted.entity_id, 'sensor.deep');
  // What survives is shallow enough to serialise.
  assert.doesNotThrow(() => JSON.stringify(redacted));
  assert.equal(JSON.stringify(redacted).includes('bottom'), false);
});

test('a __proto__ key from JSON stays a plain key, and the copy keeps a plain prototype', () => {
  const parsed = JSON.parse('{"entity_id":"sensor.x","state":"ok","attributes":{"__proto__":{"polluted":1},"x":"y"}}');
  const attributes = (redactTokens(parsed) as { attributes: Record<string, unknown> }).attributes;
  assert.equal(Object.getPrototypeOf(attributes), Object.prototype);
  assert.equal(Object.hasOwn(attributes, '__proto__'), true);
  assert.equal((attributes as { polluted?: unknown }).polluted, undefined);
  assert.equal(attributes['x'], 'y');
});

test('what is not a state passes through unchanged', () => {
  assert.equal(redactTokens(null), null);
  assert.equal(redactTokens('on'), 'on');
  assert.equal(redactTokens(42), 42);
  assert.deepEqual(redactTokens({ entity_id: 'light.kitchen', state: 'on' }), { entity_id: 'light.kitchen', state: 'on' });
});

test('the snapshot, both shapes of a service answer and an error body are all handled', () => {
  const light = { entity_id: 'light.kitchen', state: 'on', attributes: { brightness: 255 } };

  const snapshot = redactTokens([light, camera()]) as unknown[];
  assert.deepEqual(snapshot[0], light);
  assert.equal(JSON.stringify(snapshot).includes(CAMERA_TOKEN), false);

  // `POST /api/services/...` answers the states it changed, under `changed_states` when the
  // response was asked for.
  const answer = redactTokens({ changed_states: [camera()], service_response: null });
  assert.equal(JSON.stringify(answer).includes(CAMERA_TOKEN), false);
  assert.equal((answer as { service_response: unknown }).service_response, null);

  assert.deepEqual(redactTokens({ error: 'Agent not connected' }), { error: 'Agent not connected' });
  assert.equal(redactTokens(''), '');
  assert.equal(redactTokens(undefined), undefined);
});
