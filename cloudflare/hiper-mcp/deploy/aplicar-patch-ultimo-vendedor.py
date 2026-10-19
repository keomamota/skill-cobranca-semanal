#!/usr/bin/env python3
"""Aplica a ferramenta buscar_ultimo_vendedor_pos_venda ao bundle PUBLICADO do nl-sales-hiper-mcp.

Por que existe: o código-fonte do Worker publicado não está neste repositório (a pasta aqui é uma
versão antiga). O fluxo é: baixar o publicado, aplicar este patch, testar e publicar.

  npx wrangler init --from-dash nl-sales-hiper-mcp --no-delegate-c3 --yes   # em uma pasta vazia
  python3 aplicar-patch-ultimo-vendedor.py <pasta-baixada>/nl-sales-hiper-mcp/src/index.js
  npx wrangler deploy --keep-vars   # dentro da pasta baixada (só com aprovação da Keoma)
"""
import re, sys, pathlib

alvo = pathlib.Path(sys.argv[1])
fonte = pathlib.Path(__file__).resolve().parent.parent / "src" / "ultimo-vendedor.js"
mod = fonte.read_text()
mod = re.sub(r'export const DESTINOS_PERMITIDOS = \[.*?\];\n\n', '', mod, flags=re.S)  # já existe no bundle
mod = mod.replace('export const DESCRICAO_FERRAMENTA', 'var DESCRICAO_ULTIMO_VENDEDOR').replace('DESCRICAO_FERRAMENTA', 'DESCRICAO_ULTIMO_VENDEDOR')
mod = mod.replace('const SQL =', 'var SQL_ULTIMO_VENDEDOR =').replace('.prepare(SQL)', '.prepare(SQL_ULTIMO_VENDEDOR)')
mod = mod.replace('export async function', 'async function').replace('export function', 'function').replace('export const', 'var')
bloco = '\n// --- buscar_ultimo_vendedor_pos_venda (fonte: cloudflare/hiper-mcp/src/ultimo-vendedor.js) ---\n' + mod.strip() + '\n// --- fim ---\n'

s = alvo.read_text()
if 'registrarFerramentaUltimoVendedor' in s:
    sys.exit('patch já aplicado')
marca = '__name(registrarFerramentaDesempenho, "registrarFerramentaDesempenho");'
chamada = '  registrarFerramentaDesempenho(server, env, external_exports);'
assert s.count(marca) == 1 and s.count(chamada) == 1, 'bundle diferente do esperado: revisar o patch'
s = s.replace(marca, marca + bloco, 1)
s = s.replace(chamada, chamada + '\n  registrarFerramentaUltimoVendedor(server, env, external_exports);', 1)
alvo.write_text(s)
print('patch aplicado em', alvo)
