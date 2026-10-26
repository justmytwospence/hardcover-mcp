/** Only our single-operation, fragment-free documents are accepted. Fail closed before I/O. */
export function inspectOperation(document: string): {
  mutation: boolean;
  cost: number;
  roots: string[];
} {
  const tokens =
    document
      .match(/#[^\n\r]*|"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|\.\.\.|[_A-Za-z][_0-9A-Za-z]*|[^\s,]/g)
      ?.filter((token) => !token.startsWith("#")) ?? [];
  let i = 0;
  const invalid = (): never => {
    throw new Error("Unsupported GraphQL document; use one fragment-free query or mutation.");
  };
  const group = (open: string, close: string): void => {
    if (tokens[i++] !== open) invalid();
    while (i < tokens.length && tokens[i] !== close) {
      if (tokens[i] === "(") group("(", ")");
      else if (tokens[i] === "{") group("{", "}");
      else if (tokens[i] === "[") group("[", "]");
      else i++;
    }
    if (tokens[i++] !== close) invalid();
  };
  const name = (): string => {
    const token = tokens[i++];
    return token && /^[_A-Za-z][_0-9A-Za-z]*$/.test(token) ? token : invalid();
  };
  const directives = (): void => {
    while (tokens[i] === "@") {
      i++;
      name();
      if (tokens[i] === "(") group("(", ")");
    }
  };
  let mutation = false;
  if (tokens[i] !== "{") {
    const operation = name();
    if (operation !== "query" && operation !== "mutation") invalid();
    mutation = operation === "mutation";
    if (tokens[i] !== "(" && tokens[i] !== "{" && tokens[i] !== "@") name();
    if (tokens[i] === "(") group("(", ")");
    directives();
  }
  if (tokens[i++] !== "{") invalid();
  let cost = 0;
  const roots: string[] = [];
  let exemptJournal = false;
  while (i < tokens.length && tokens[i] !== "}") {
    let field = name();
    roots.push(field);
    if (tokens[i] === ":") {
      i++;
      field = name();
    }
    if (field === "insert_reading_journal") exemptJournal = true;
    else if (!field.startsWith("__")) cost++;
    if (tokens[i] === "(") group("(", ")");
    directives();
    if (tokens[i] === "{") group("{", "}");
  }
  if (tokens[i++] !== "}" || i !== tokens.length) invalid();
  return { mutation, cost: Math.max(1, cost + Number(exemptJournal)), roots };
}
