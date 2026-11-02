import {parseCommandPreferences,type CommandPreferences} from "./commands.ts";
import {parseWordLayout,type WordLayout} from "./wordLayout.ts";
export interface ReadingOptions { fontSize: number; lineHeight: number; width: number; }
export interface Workspace {
  commands:CommandPreferences;wordLayout:WordLayout;
  version: 1; favorites: string[]; tabs: string[]; activePath: string | null; rightFile: string | null;
  splitMode: boolean; sidebarWidth: number; sidebarOpen: boolean; tocOpen: boolean; splitRatio: number;
  expandedFolders: string[]; scroll: Record<string, number>; reading: ReadingOptions;
  background: { url: string | null; opacity: number; blur: number };
  autosaveSeconds: number; recent: string[]; collections: Collection[];
  theme:"light"|"dark"|"system";
}
const clamp = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(min,Math.min(max,value)) : fallback;
const path = (value: unknown): value is string => typeof value === "string" && !!value && !value.startsWith("/") && !value.startsWith(".") && !/[\\:\x00-\x1f]/.test(value) && !value.split("/").some(part=>!part || part === "." || part === "..");
const paths = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter(path))].slice(0,500) : [];
export function parseWorkspace(input: unknown): Workspace {
  const value: any = input && typeof input === "object" ? input : {};
  return {commands:parseCommandPreferences(value.commands),wordLayout:parseWordLayout(value.wordLayout),version:1,favorites:paths(value.favorites),tabs:paths(value.tabs),activePath:path(value.activePath)?value.activePath:null,
    rightFile:path(value.rightFile)?value.rightFile:null,splitMode:value.splitMode === true,
    sidebarWidth:clamp(value.sidebarWidth,240,150,600),sidebarOpen:value.sidebarOpen !== false,tocOpen:value.tocOpen === true,
    splitRatio:clamp(value.splitRatio,.5,.2,.8),expandedFolders:paths(value.expandedFolders),
    scroll:Object.fromEntries(Object.entries(value.scroll && typeof value.scroll === "object" ? value.scroll : {}).filter(([key,v])=>path(key)&&typeof v === "number"&&Number.isFinite(v)&&v>=0).slice(-2000)) as Record<string,number>,
    reading:{fontSize:clamp(value.reading?.fontSize,16,12,24),lineHeight:clamp(value.reading?.lineHeight,1.8,1.3,2.4),width:clamp(value.reading?.width,900,520,1400)},
    background:{url:typeof value.background?.url === "string"?value.background.url:null,opacity:clamp(value.background?.opacity,1,.05,1),blur:clamp(value.background?.blur,0,0,20)},
    autosaveSeconds:clamp(value.autosaveSeconds,5,0,120), recent:paths(value.recent).slice(0,100),
    theme:["light","dark","system"].includes(value.theme)?value.theme:"system",
    collections:Array.isArray(value.collections)?value.collections.filter((c:any)=>c&&typeof c.id==="string"&&typeof c.name==="string"&&c.filter&&typeof c.filter==="object").slice(0,100).map((c:any)=>({id:c.id,name:c.name.slice(0,100),pinned:c.pinned===true,view:c.view==="table"?"table":"list",sort:["relevance","title","modified","created","type","status"].includes(c.sort)?c.sort:"relevance",descending:c.descending===true,groupBy:["type","status"].includes(c.groupBy)?c.groupBy:"none",filter:Object.fromEntries(Object.keys(emptyFilter()).map(key=>[key,typeof c.filter[key]==="string"?c.filter[key].slice(0,500):""]))})):[],
  };
}
import type { Collection } from "./knowledge.ts";
import { emptyFilter } from "./knowledge.ts";
