import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);
const PASSWORD_KEY_LENGTH = 64;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scrypt(
    password,
    salt,
    PASSWORD_KEY_LENGTH,
  )) as Buffer;

  return `${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, passwordHash: string) {
  const [salt, storedHash] = passwordHash.split(':');

  if (!salt || !storedHash) {
    return false;
  }

  const derivedKey = (await scrypt(
    password,
    salt,
    PASSWORD_KEY_LENGTH,
  )) as Buffer;
  const storedKey = Buffer.from(storedHash, 'hex');

  if (storedKey.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(storedKey, derivedKey);
}
