import { PrismLight as Highlighter } from "react-syntax-highlighter";
import vs from "react-syntax-highlighter/dist/esm/styles/prism/vs";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";

for (const [name, syntax] of Object.entries({ cpp, python, javascript, typescript, markup, html: markup, css, json, bash, sql, java, go, rust, markdown })) Highlighter.registerLanguage(name, syntax);
export default function CodeHighlight(props: any) { return <Highlighter {...props} style={vs} />; }
