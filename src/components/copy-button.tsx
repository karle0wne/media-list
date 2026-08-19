"use client";
import { useState } from "react";
export function CopyButton({text,label="Copy"}:{text:string;label?:string}){const[copied,setCopied]=useState(false);async function copy(){await navigator.clipboard.writeText(text);setCopied(true);window.setTimeout(()=>setCopied(false),1500);}return <button className="secondary" type="button" onClick={copy}>{copied?"Copied":label}</button>;}
