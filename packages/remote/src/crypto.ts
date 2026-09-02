export type RemoteRole = "desktop" | "mobile";
export type RemoteDirection = "desktop-to-mobile" | "mobile-to-desktop";

export interface ExportedDeviceKeys {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}

export interface SessionKeys {
  outbound: CryptoKey;
  inbound: CryptoKey;
  outboundDirection: RemoteDirection;
  inboundDirection: RemoteDirection;
}

export interface EncryptedEnvelope {
  version: 1;
  roomId: string;
  direction: RemoteDirection;
  sequence: number;
  nonce: string;
  ciphertext: string;
}

const maxRemoteRoomIdLength = 128;
const maxRemoteCiphertextChars = 128 * 1024;
const maxRemotePlaintextBytes = 48 * 1024;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/u;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string): Uint8Array {
  if (!value || !base64UrlPattern.test(value) || value.length % 4 === 1) throw new Error("Invalid base64url value.");
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function cryptoApi(): Crypto {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is unavailable in this environment.");
  return globalThis.crypto;
}

function canonicalPublicKey(publicKey: JsonWebKey): Uint8Array {
  if (publicKey.kty !== "EC" || publicKey.crv !== "P-256" || !publicKey.x || !publicKey.y
    || publicKey.x.length !== 43 || publicKey.y.length !== 43
    || !base64UrlPattern.test(publicKey.x) || !base64UrlPattern.test(publicKey.y)) {
    throw new Error("Remote public key is not a P-256 ECDH key.");
  }
  return encoder.encode(JSON.stringify({ kty: publicKey.kty, crv: publicKey.crv, x: publicKey.x, y: publicKey.y }));
}

export async function publicKeyFingerprint(publicKey: JsonWebKey): Promise<string> {
  const digest = await cryptoApi().subtle.digest("SHA-256", asArrayBuffer(canonicalPublicKey(publicKey)));
  return toBase64Url(new Uint8Array(digest));
}

async function pairingHmacKey(oneTimeSecret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  if (oneTimeSecret.length < 16 || oneTimeSecret.length > 256 || !base64UrlPattern.test(oneTimeSecret)) throw new Error("Invalid pairing secret.");
  return cryptoApi().subtle.importKey(
    "raw",
    asArrayBuffer(fromBase64Url(oneTimeSecret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

async function pairingProofPayload(roomId: string, publicKey: JsonWebKey): Promise<ArrayBuffer> {
  if (!roomId || roomId.length > maxRemoteRoomIdLength) throw new Error("Invalid remote room identifier.");
  const fingerprint = await publicKeyFingerprint(publicKey);
  return asArrayBuffer(encoder.encode(`summonerkit-pairing:v1:${roomId}:${fingerprint}`));
}

export async function createPairingProof(
  oneTimeSecret: string,
  roomId: string,
  publicKey: JsonWebKey,
): Promise<string> {
  const signature = await cryptoApi().subtle.sign(
    "HMAC",
    await pairingHmacKey(oneTimeSecret, ["sign"]),
    await pairingProofPayload(roomId, publicKey),
  );
  return toBase64Url(new Uint8Array(signature));
}

export async function verifyPairingProof(
  proof: string,
  oneTimeSecret: string,
  roomId: string,
  publicKey: JsonWebKey,
): Promise<boolean> {
  return cryptoApi().subtle.verify(
    "HMAC",
    await pairingHmacKey(oneTimeSecret, ["verify"]),
    asArrayBuffer(fromBase64Url(proof)),
    await pairingProofPayload(roomId, publicKey),
  );
}

function asArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.slice().buffer as ArrayBuffer;
}

function directionFor(role: RemoteRole): Pick<SessionKeys, "outboundDirection" | "inboundDirection"> {
  return role === "desktop"
    ? { outboundDirection: "desktop-to-mobile", inboundDirection: "mobile-to-desktop" }
    : { outboundDirection: "mobile-to-desktop", inboundDirection: "desktop-to-mobile" };
}

async function deriveAesKey(material: CryptoKey, roomId: string, direction: RemoteDirection): Promise<CryptoKey> {
  return cryptoApi().subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(`summonerkit:${roomId}`),
      info: encoder.encode(`summonerkit:v2:${direction}`),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function generateDeviceKeys(): Promise<ExportedDeviceKeys> {
  const keyPair = await cryptoApi().subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits", "deriveKey"],
  );
  return {
    publicKey: await cryptoApi().subtle.exportKey("jwk", keyPair.publicKey),
    privateKey: await cryptoApi().subtle.exportKey("jwk", keyPair.privateKey),
  };
}

export async function deriveSessionKeys(
  role: RemoteRole,
  roomId: string,
  ownPrivateKey: JsonWebKey,
  peerPublicKey: JsonWebKey,
): Promise<SessionKeys> {
  if (!roomId || roomId.length > maxRemoteRoomIdLength) throw new Error("Invalid remote room identifier.");
  const ownKey = await cryptoApi().subtle.importKey(
    "jwk",
    ownPrivateKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  const peerKey = await cryptoApi().subtle.importKey(
    "jwk",
    peerPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedBits = await cryptoApi().subtle.deriveBits(
    { name: "ECDH", public: peerKey },
    ownKey,
    256,
  );
  const material = await cryptoApi().subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  const directions = directionFor(role);
  return {
    ...directions,
    outbound: await deriveAesKey(material, roomId, directions.outboundDirection),
    inbound: await deriveAesKey(material, roomId, directions.inboundDirection),
  };
}

function additionalData(envelope: Pick<EncryptedEnvelope, "version" | "roomId" | "direction" | "sequence">): ArrayBuffer {
  return asArrayBuffer(encoder.encode(`${envelope.version}|${envelope.roomId}|${envelope.direction}|${envelope.sequence}`));
}

export function parseEncryptedEnvelope(candidate: unknown): EncryptedEnvelope {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Encrypted message envelope is invalid.");
  const envelope = candidate as Partial<EncryptedEnvelope>;
  if (envelope.version !== 1 || typeof envelope.roomId !== "string" || !envelope.roomId || envelope.roomId.length > maxRemoteRoomIdLength) {
    throw new Error("Encrypted message context is invalid.");
  }
  if (envelope.direction !== "desktop-to-mobile" && envelope.direction !== "mobile-to-desktop") {
    throw new Error("Encrypted message direction is invalid.");
  }
  const sequence = envelope.sequence;
  if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 1) throw new Error("Encrypted message sequence is invalid.");
  if (typeof envelope.nonce !== "string" || envelope.nonce.length !== 16 || !base64UrlPattern.test(envelope.nonce)) {
    throw new Error("Encrypted message nonce is invalid.");
  }
  if (typeof envelope.ciphertext !== "string" || envelope.ciphertext.length === 0 || envelope.ciphertext.length > maxRemoteCiphertextChars || !base64UrlPattern.test(envelope.ciphertext)) {
    throw new Error("Encrypted message ciphertext is invalid.");
  }
  return {
    version: 1,
    roomId: envelope.roomId,
    direction: envelope.direction,
    sequence,
    nonce: envelope.nonce,
    ciphertext: envelope.ciphertext,
  };
}

export class EncryptedChannel {
  private outboundSequence = 0;
  private inboundSequence = 0;

  constructor(private readonly roomId: string, private readonly keys: SessionKeys) {}

  async seal(value: unknown): Promise<EncryptedEnvelope> {
    const serializedValue = JSON.stringify(value);
    if (typeof serializedValue !== "string") throw new Error("Encrypted message payload is not JSON serializable.");
    const plaintext = encoder.encode(serializedValue);
    if (plaintext.byteLength > maxRemotePlaintextBytes) throw new Error("Encrypted message payload is too large.");
    this.outboundSequence += 1;
    const sequence = this.outboundSequence;
    const nonce = cryptoApi().getRandomValues(new Uint8Array(12));
    const header = {
      version: 1 as const,
      roomId: this.roomId,
      direction: this.keys.outboundDirection,
      sequence,
    };
    const ciphertext = await cryptoApi().subtle.encrypt(
      { name: "AES-GCM", iv: asArrayBuffer(nonce), additionalData: additionalData(header), tagLength: 128 },
      this.keys.outbound,
      asArrayBuffer(plaintext),
    );
    return {
      ...header,
      nonce: toBase64Url(nonce),
      ciphertext: toBase64Url(new Uint8Array(ciphertext)),
    };
  }

  async open<T>(envelope: EncryptedEnvelope): Promise<T> {
    const normalized = parseEncryptedEnvelope(envelope);
    if (normalized.roomId !== this.roomId) throw new Error("Encrypted message context is invalid.");
    if (normalized.direction !== this.keys.inboundDirection) throw new Error("Encrypted message direction is invalid.");
    if (normalized.sequence !== this.inboundSequence + 1) {
      throw new Error("Encrypted message was replayed or arrived out of order.");
    }
    const nonce = fromBase64Url(normalized.nonce);
    if (nonce.byteLength !== 12) throw new Error("Encrypted message nonce is invalid.");
    const plaintext = await cryptoApi().subtle.decrypt(
      { name: "AES-GCM", iv: asArrayBuffer(nonce), additionalData: additionalData(normalized), tagLength: 128 },
      this.keys.inbound,
      asArrayBuffer(fromBase64Url(normalized.ciphertext)),
    );
    if (plaintext.byteLength > maxRemotePlaintextBytes) throw new Error("Encrypted message payload is too large.");
    this.inboundSequence = normalized.sequence;
    return JSON.parse(decoder.decode(plaintext)) as T;
  }
}
