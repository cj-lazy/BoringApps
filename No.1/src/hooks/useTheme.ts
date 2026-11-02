import { useEffect, useState } from "react";
export type ThemeChoice="light"|"dark"|"system";
export function useTheme(choice:ThemeChoice){
  const [systemDark,setSystemDark]=useState(()=>window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(()=>{const media=window.matchMedia("(prefers-color-scheme: dark)");const change=()=>setSystemDark(media.matches);media.addEventListener("change",change);return()=>media.removeEventListener("change",change);},[]);
  const theme=choice==="system"?(systemDark?"dark":"light"):choice;
  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem("app_theme",choice);},[theme,choice]);
  return theme;
}
