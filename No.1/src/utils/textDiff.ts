export interface DiffLine { kind: "same" | "remove" | "add"; text: string; }
// Bounded look-ahead keeps comparison responsive even for a very large source file.
export function lineDiff(before: string, after: string): DiffLine[] {
  const a=before.split(/\r?\n/),b=after.split(/\r?\n/); const out:DiffLine[]=[];
  let i=0,j=0;
  while(i<a.length||j<b.length){
    if(i<a.length&&j<b.length&&a[i]===b[j]){out.push({kind:"same",text:a[i++]});j++;continue;}
    let nextA=-1,nextB=-1;
    for(let k=1;k<=24;k++){
      if(nextA<0&&j<b.length&&a[i+k]===b[j])nextA=i+k;
      if(nextB<0&&i<a.length&&b[j+k]===a[i])nextB=j+k;
    }
    if(nextA>=0&&(nextB<0||nextA-i<=nextB-j)){while(i<nextA)out.push({kind:"remove",text:a[i++]});}
    else if(nextB>=0){while(j<nextB)out.push({kind:"add",text:b[j++]});}
    else {if(i<a.length)out.push({kind:"remove",text:a[i++]});if(j<b.length)out.push({kind:"add",text:b[j++]});}
  }return out;
}
