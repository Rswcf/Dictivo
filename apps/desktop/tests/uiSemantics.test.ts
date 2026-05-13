import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("desktop UI semantics", () => {
  it("gives every native button an explicit non-submit type", () => {
    const missingType: string[] = [];

    for (const filePath of tsxFiles("src")) {
      const sourceText = readFileSync(filePath, "utf8");
      const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

      visitJsx(sourceFile, (node) => {
        if (node.tagName.getText(sourceFile) !== "button") return;
        const hasType = node.attributes.properties.some(
          (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === "type"
        );

        if (!hasType) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          missingType.push(`${relative(process.cwd(), filePath)}:${line + 1}:${character + 1}`);
        }
      });
    }

    expect(missingType).toEqual([]);
  });
});

function tsxFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return tsxFiles(path);
    if (path.endsWith(".tsx")) return [path];
    return [];
  });
}

function visitJsx(node: ts.Node, onOpeningElement: (node: ts.JsxOpeningElement | ts.JsxSelfClosingElement) => void) {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    onOpeningElement(node);
  }
  ts.forEachChild(node, (child) => visitJsx(child, onOpeningElement));
}
