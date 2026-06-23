// 将 2+ 连续空格转为 &nbsp; 以绕过 rehype-minify-whitespace
// 同时将空段落填充 &nbsp; 以防止 markdown 回合丢失
export const encodeSpacesInBlocks = (blocks: any[]): any[] => {
    const encode = (text: string): string =>
      text.replace(/ {2,}/g, (m: string) => ' '.repeat(m.length));

    return blocks.map((block) => {
      const cloned = JSON.parse(JSON.stringify(block));
      // Handle empty paragraph: insert &nbsp; so markdown round-trip preserves it
      const isEmptyParagraph = cloned.type === 'paragraph' && (
        !Array.isArray(cloned.content) || cloned.content.length === 0 ||
        (cloned.content.length === 1 && cloned.content[0].type === 'text' && !cloned.content[0].text)
      );
      if (isEmptyParagraph) {
        cloned.content = [{ type: 'text', text: ' ', styles: {} }];
      } else if (Array.isArray(cloned.content)) {
        for (const node of cloned.content) {
          if (typeof node.text === 'string') node.text = encode(node.text);
        }
      }
      if (Array.isArray(cloned.children)) {
        cloned.children = encodeSpacesInBlocks(cloned.children);
      }
      return cloned;
    });
};
