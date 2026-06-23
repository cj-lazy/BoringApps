// 斜杠菜单过滤：按标题和别名匹配
export const filterSuggestionItems = (items: any[], query: string) => {
  return items.filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase()) ||
    (item.aliases && item.aliases.some((alias: string) => alias.toLowerCase().includes(query.toLowerCase())))
  );
};

// 文件树排序：文件夹优先，再按名称自然排序
export const sortFileTree = (nodes: any[]): any[] => {
    return [...nodes].sort((a, b) => {
        if (a.is_dir && !b.is_dir) return -1;
        if (!a.is_dir && b.is_dir) return 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    }).map(node => {
        if (node.children && node.children.length > 0) {
            return { ...node, children: sortFileTree(node.children) };
        }
        return node;
    });
};
