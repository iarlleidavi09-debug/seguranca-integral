import type { Ambiente } from '../../shared/mapa';
type AvisoPlanta = { tipo: 'escada' | 'nome' | 'sobreposicao'; texto: string; ids: string[] };
function partes(a: Ambiente) {
 const t = a.espessura ?? .35;
 const boxes = a.formato === 'l' ? [[0,0,1,t],[0,t,t,1]] : [[0,0,1,1]];
 return boxes.map(([x1,y1,x2,y2]) => {
  const points = [[x1,y1],[x2,y1],[x1,y2],[x2,y2]].map(p => {
   let [x,y] = p;
   for (let r=0;r<(a.rotacao??0);r+=90) [x,y]=[1-y,x];
   return [a.x+x*a.largura,a.y+y*a.altura];
  });
  return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
 });
}
export function conferirPlanta(ambientes: Ambiente[]): AvisoPlanta[] {
 const avisos: AvisoPlanta[] = [];
 for (let i=0;i<ambientes.length;i++) {
  const a=ambientes[i];
  if(a.tipo==='escadaria' && !ambientes.some(b=>b.pai_id===a.id)) avisos.push({tipo:'escada',texto:`${a.nome}: escadaria sem ambientes de destino.`,ids:[a.id]});
  for(let j=i+1;j<ambientes.length;j++) {
   const b=ambientes[j];
   if(a.pai_id!==b.pai_id)continue;
   if(a.nome.trim().toLocaleLowerCase('pt-BR')===b.nome.trim().toLocaleLowerCase('pt-BR')) avisos.push({tipo:'nome',texto:`Nome repetido neste nível: ${a.nome}.`,ids:[a.id,b.id]});
   if(partes(a).some(r=>partes(b).some(s=>r[0]<s[2]&&r[2]>s[0]&&r[1]<s[3]&&r[3]>s[1]))) avisos.push({tipo:'sobreposicao',texto:`Sobreposição entre ${a.nome} e ${b.nome}.`,ids:[a.id,b.id]});
  }
 }
 return avisos;
}
