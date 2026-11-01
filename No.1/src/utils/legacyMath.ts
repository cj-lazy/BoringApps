export interface LegacyMathPart { kind: "math" | "text"; text: string; }

// A previous exporter leaked its placeholders and Markdown hard breaks inside
// a single $$ block. Recognize that specific transport format, not arbitrary TeX.
export function legacyMathParts(source: string): LegacyMathPart[] | undefined {
  const markers = [...source.matchAll(/^[ \t]*\*{0,2}@@LATEX_ID_\d+@@\*{0,2}[ \t]*\\?[ \t]*\r?$/gm)];
  if (markers.length < 2 || !/\n[ \t]*\\[ \t]*\r?\n/.test(source)) return undefined;
  const pieces = source.split(/^[ \t]*(?:\*{0,2}@@LATEX_ID_\d+@@\*{0,2}|\$\$)[ \t]*\\?[ \t]*\r?$/gm);
  return pieces.flatMap<LegacyMathPart>(piece => {
    // Do not guess missing subscripts, turn '*' into '_', or repair commands.
    // These changes would alter the meaning of already-damaged equations.
    const lines = piece.replace(/(?<!\\)\\[ \t]*(?=\r?\n|$)/g, "").split(/\r?\n/)
      .map(line => line.trim()).filter(Boolean);
    if (!lines.length) return [];
    const text = lines.join("\n");
    const isMath = /^[*\\A-Za-z|]/.test(text) && /\\[A-Za-z]+|[=<>]/.test(text);
    if (!isMath) return [{ kind: "text" as const, text }];
    // Recover line boundaries only inside explicit multi-row environments.
    // Ordinary TeX (including inline '\\ ' and existing '\\\\') is unchanged.
    let depth = 0;
    const environment = "(?:aligned|alignedat|gathered|cases|array|[pbBvV]?matrix)";
    const begin = new RegExp("\\\\begin\\{" + environment + "\\}", "g");
    const end = new RegExp("\\\\end\\{" + environment + "\\}", "g");
    const tex = lines.map((line, index) => {
      depth += (line.match(begin) || []).length - (line.match(end) || []).length;
      const next = lines[index + 1];
      const openingOnly = /^\\begin\{[^}]+\}(?:\{[^}]*\})?$/.test(line);
      if (depth > 0 && next && !openingOnly && !/^\\end\{/.test(next) && !/\\\\(?:\[[^\]]*\])?$/.test(line)) {
        return line + " \\\\";
      }
      return line;
    }).join("\n");
    return [{ kind: "math" as const, text: tex }];
  });
}
