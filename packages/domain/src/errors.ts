/**
 * Erreurs métier typées : un `code` stable permet à l'UI de traduire le message
 * et aux tests de vérifier la cause exacte sans dépendre du texte.
 */
export type DomainErrorCode =
  | "INVALID_RATIONAL"
  | "DIVISION_BY_ZERO"
  | "UNKNOWN_UNIT"
  | "UNCONVERTIBLE_UNIT"
  | "INVALID_QUANTITY"
  | "INVALID_DATE"
  | "INVALID_CLOCK";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details: Readonly<Record<string, string>>;
  constructor(code: DomainErrorCode, message: string, details: Record<string, string> = {}) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}
