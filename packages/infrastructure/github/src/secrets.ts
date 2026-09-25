import { verifySignature, type SignatureVerdict } from './signature.js';

/**
 * Where this package's secrets come from, and why they cannot be read back out.
 *
 * The brief's security clause is that the App installation token and the webhook
 * secret live on the infrastructure side of the boundary and never leave it —
 * not in a response, not in a log, not in a URL. A function that RETURNS a
 * secret satisfies none of that: the caller holds the bytes and the rest is
 * discipline. So neither of these is a getter.
 *
 * `WebhookSecret` is a class with a private field whose only public operation is
 * "tell me whether this delivery is mine" — the bytes cannot be serialised,
 * logged, attached to an error, or spread into an object literal, because there
 * is no property to read. The installation token is not a class at all: it is
 * captured in a closure by `createIssueLookup`, and no exported type in this
 * package is capable of holding one.
 *
 * That is the version of this a later contributor cannot undo by adding a field.
 */

export const WEBHOOK_SECRET_VARIABLE = 'GITHUB_WEBHOOK_SECRET';
export const INSTALLATION_TOKEN_VARIABLE = 'GITHUB_APP_TOKEN';

/** The slice of `process.env` this package reads. Narrow on purpose. */
export type SecretEnvironment = Readonly<Record<string, string | undefined>>;

export class WebhookSecret {
  readonly #value: string;

  constructor(value: string) {
    if (value === '') {
      throw new Error('a webhook secret cannot be empty');
    }
    this.#value = value;
  }

  /**
   * The whole public surface. Note what is absent: no `value`, no `toString`, no
   * `toJSON`. An `Error` built from this object serialises to `{}`.
   */
  accepts(rawBody: string, header: string | null): SignatureVerdict {
    return verifySignature({ rawBody, header, secret: this.#value });
  }
}

export function githubWebhookSecretFromEnv(env: SecretEnvironment): WebhookSecret | undefined {
  const value = env[WEBHOOK_SECRET_VARIABLE];
  return value === undefined || value === '' ? undefined : new WebhookSecret(value);
}
