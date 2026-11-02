export interface WordLayout {paper:"A4"|"Letter";font:string;westernFont:string;fontSize:number;lineHeight:number;margin:number;headingNumbers:boolean;captions:boolean;equationNumbers:boolean;header:string;pageNumbers:boolean;}
export const wordPresets:Record<string,WordLayout>={
  "标准笔记":{paper:"Letter",font:"宋体",westernFont:"Calibri",fontSize:11,lineHeight:1.25,margin:25.4,headingNumbers:false,captions:false,equationNumbers:false,header:"",pageNumbers:false},
  "学术报告":{paper:"A4",font:"宋体",westernFont:"Times New Roman",fontSize:12,lineHeight:1.5,margin:25.4,headingNumbers:true,captions:true,equationNumbers:true,header:"{{title}}",pageNumbers:true},
  "紧凑讲义":{paper:"A4",font:"微软雅黑",westernFont:"Arial",fontSize:10.5,lineHeight:1.2,margin:18,headingNumbers:true,captions:true,equationNumbers:false,header:"{{title}} · {{date}}",pageNumbers:true},
};
export function parseWordLayout(v:any):WordLayout{
  const d=wordPresets["标准笔记"],number=(key:keyof WordLayout,min:number,max:number)=>typeof v?.[key]==="number"&&Number.isFinite(v[key])?Math.max(min,Math.min(max,v[key])):d[key] as number;
  return {...d,paper:v?.paper==="A4"?"A4":"Letter",font:typeof v?.font==="string"?v.font.slice(0,80):d.font,westernFont:typeof v?.westernFont==="string"?v.westernFont.slice(0,80):d.westernFont,fontSize:number("fontSize",8,24),lineHeight:number("lineHeight",1,3),margin:number("margin",10,45),headingNumbers:v?.headingNumbers===true,captions:v?.captions===true,equationNumbers:v?.equationNumbers===true,header:typeof v?.header==="string"?v.header.slice(0,200):"",pageNumbers:v?.pageNumbers===true};
}
