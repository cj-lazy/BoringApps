export const getFileType = (name: string): 'image' | 'text' | 'docx' | 'pdf' | 'other' => {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const imageExts = ['png','jpg','jpeg','gif','webp','svg','bmp','ico'];
  const textExts = ['txt','md','json','xml','csv','log','js','ts','jsx','tsx','py','java',
                    'c','cpp','h','hpp','rs','go','rb','php','html','css','scss','less',
                    'sh','bash','yml','yaml','toml','ini','cfg','conf'];
  const docxExts = ['docx'];
  const pdfExts = ['pdf'];
  if (imageExts.includes(ext)) return 'image';
  if (textExts.includes(ext)) return 'text';
  if (docxExts.includes(ext)) return 'docx';
  if (pdfExts.includes(ext)) return 'pdf';
  return 'other';
};
