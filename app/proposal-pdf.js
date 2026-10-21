/* A4 PDF pages rendered locally with browser fonts, including Unicode source text.
 * Source text is retained separately with the file for project creation.
 */
(()=>{
'use strict';
async function create(title,blocks,signal){
 const width=1240,height=1754,margin=100,bottom=height-100,pages=[];
 let canvas,ctx,y;
 const check=()=>{if(signal?.aborted)throw new DOMException('Stopped','AbortError');};
 function start(){canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;ctx=canvas.getContext('2d');if(!ctx)throw Error('This browser could not create the proposal PDF.');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#243348';y=margin;}
 async function finish(){check();ctx.font='18px Arial, sans-serif';ctx.fillStyle='#637083';ctx.fillText('AIM-STEP | Review protocol',margin,height-54);ctx.textAlign='right';ctx.fillText(String(pages.length+1),width-margin,height-54);ctx.textAlign='left';const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.94));if(!blob)throw Error('Could not encode the proposal PDF.');pages.push(new Uint8Array(await blob.arrayBuffer()));canvas.width=canvas.height=0;}
 function lines(text,font){ctx.font=font;const out=[];for(const paragraph of String(text).replace(/\r\n?/g,'\n').split('\n')){if(!paragraph.trim()){out.push('');continue;}let line='';const words=paragraph.split(/(\s+)/);for(const word of words){if(ctx.measureText(line+word).width<=width-2*margin){line+=word;continue;}if(line.trim())out.push(line.trimEnd());line='';for(const char of word){if(ctx.measureText(line+char).width>width-2*margin){out.push(line);line='';}line+=char;}}if(line.trim())out.push(line.trimEnd());}return out;}
 async function write(text,kind){const size=kind==='title'?36:kind==='heading'?25:21,lineHeight=kind==='title'?48:kind==='heading'?36:33,font=(kind==='body'?'':'600 ')+size+'px Arial, sans-serif';const wrapped=lines(text,font);if(kind==='heading'&&y+lineHeight+66>bottom){await finish();start();}for(const line of wrapped){check();if(y+lineHeight>bottom){await finish();start();}ctx.font=font;ctx.fillStyle=kind==='body'?'#243348':'#17263b';ctx.fillText(line,margin,y+size);y+=lineHeight;}y+=kind==='body'?18:24;}
 start();await write(title,'title');for(const block of blocks){if(block.heading)await write(block.heading,'heading');if(block.text)await write(block.text,'body');}await finish();check();
 const encoder=new TextEncoder(),parts=[],offsets=[0];let length=0;
 const push=value=>{const bytes=typeof value==='string'?encoder.encode(value):value;parts.push(bytes);length+=bytes.length;};
 const object=(id,body)=>{offsets[id]=length;push(id+' 0 obj\n');push(body);push('\nendobj\n');};
 push('%PDF-1.4\n');object(1,'<< /Type /Catalog /Pages 2 0 R >>');object(2,'<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>');
 for(let i=0;i<pages.length;i++){
  const id=3+i*3,image=pages[i],command='q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n';
  object(id,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 '+(id+1)+' 0 R >> >> /Contents '+(id+2)+' 0 R >>');
  offsets[id+1]=length;push((id+1)+' 0 obj\n<< /Type /XObject /Subtype /Image /Width '+width+' /Height '+height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+image.length+' >>\nstream\n');push(image);push('\nendstream\nendobj\n');
  object(id+2,'<< /Length '+encoder.encode(command).length+' >>\nstream\n'+command+'endstream');
 }
 const count=3+pages.length*3,xref=length;push('xref\n0 '+count+'\n0000000000 65535 f \n');for(let id=1;id<count;id++)push(String(offsets[id]).padStart(10,'0')+' 00000 n \n');push('trailer\n<< /Size '+count+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
 return new Blob(parts,{type:'application/pdf'});
}
window.AimstepProposalPdf={create};
})();
