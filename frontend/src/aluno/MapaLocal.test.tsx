import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import MapaLocal from './MapaLocal';

const planta = { revisao: 1, ambientes: [
 { id:'patio',nome:'Pátio',tipo:'area',pai_id:null,x:0,y:0,largura:400,altura:200 },
 { id:'escada',nome:'Escada para 1º andar',tipo:'escadaria',pai_id:null,x:500,y:0,largura:200,altura:200 },
 { id:'sala',nome:'Sala 201',tipo:'sala',pai_id:'escada',x:0,y:0,largura:300,altura:200 },
] };
it('marca ambientes por teclado, usa escadas sem marcar e volta ao térreo', async () => {
 vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(planta)));
 const escolher=vi.fn();
 const { rerender }=render(<MapaLocal valor="" aoEscolher={escolher}/>);
 fireEvent.keyDown(await screen.findByRole('button',{name:'Marcar: Pátio'}),{key:'Enter'});
 expect(escolher).toHaveBeenLastCalledWith('patio');
 escolher.mockClear();
 fireEvent.click(screen.getByRole('button',{name:'Ir para: Escada para 1º andar'}));
 expect(escolher).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Marcar: Sala 201'}));
 expect(escolher).toHaveBeenCalledWith('sala');
 rerender(<MapaLocal valor="sala" aoEscolher={escolher}/>);
 expect(screen.getByRole('status')).toHaveTextContent('Local marcado: Sala 201');
 expect(screen.getByRole('button',{name:'Marcar: Sala 201'})).toHaveAttribute('aria-pressed','true');
 fireEvent.click(screen.getByRole('button',{name:'Térreo / escola'}));
 expect(screen.getByRole('button',{name:'Marcar: Pátio'})).toBeInTheDocument();
 expect(vi.mocked(fetch).mock.calls.every(([url])=>url==='/api/planta')).toBe(true);
});
it('permite tentar novamente quando a planta está indisponível',async()=>{
 vi.mocked(fetch).mockRejectedValueOnce(new Error('offline')).mockImplementation(async()=>new Response(JSON.stringify(planta)));
 render(<MapaLocal valor="" aoEscolher={()=>{}}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Tentar carregar a planta'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Marcar: Pátio'})).toBeInTheDocument());
});
it('localiza uma sala de outro andar sem marcar automaticamente',async()=>{
 vi.mocked(fetch).mockImplementation(async()=>new Response(JSON.stringify(planta)));
 const escolher=vi.fn();
 render(<MapaLocal valor="" aoEscolher={escolher}/>);
 await screen.findByRole('button',{name:'Marcar: Pátio'});
 fireEvent.change(screen.getByRole('searchbox',{name:'Buscar ambiente na planta'}),{target:{value:'201'}});
 fireEvent.click(screen.getByRole('button',{name:'Localizar Sala 201'}));
 expect(screen.getByRole('button',{name:'Marcar: Sala 201'})).toBeInTheDocument();
 expect(escolher).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Marcar: Sala 201'}));
 expect(escolher).toHaveBeenCalledWith('sala');
});
