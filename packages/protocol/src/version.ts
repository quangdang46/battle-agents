import { z } from 'zod';

const SEMANTIC_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export const PROTOCOL_VERSION = '0.1.0';

export const protocolVersionSchema = z.string().regex(SEMANTIC_VERSION_PATTERN);
