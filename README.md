# Arquiteto da Energia — Protótipo de gameplay (ENGIE)

Protótipo web **descartável** para sentir o loop de gameplay do jogo phygital da ENGIE
(cliente Cafundó). Só a parte de jogo, single-player, sem hardware. HTML + Canvas + JS vanilla,
sem build e sem dependências.

## Como rodar

Abra `index.html` no navegador. Para garantir tudo funcionando (fontes, caminhos), sirva a pasta:

```
python -m http.server 8000
# depois abra http://localhost:8000
```

Ou publique via GitHub Pages e jogue pela URL.

## Como jogar (Level 1 — Ilumine a Cidade)

Objetivo: levar energia à cidade **sem estourar o orçamento** e mantendo o equilíbrio.

1. Escolha uma peça na paleta (Solar, Hidrelétrica, Linha, Remover).
2. Clique numa célula do tabuleiro para colocar.
   - Solar rende mais em célula ensolarada (mais clara); vai em terra.
   - Hidrelétrica só na água (ou ao lado dela); muita energia, mas cara e menos sustentável.
   - Linha conecta as fontes até a cidade; cada segmento custa e gera perda por distância.
3. Ligue as fontes à cidade traçando linhas.
4. "Finalizar fase" mostra o resultado e a pontuação.

Vence quem entrega a energia exigida, dentro do orçamento, com sustentabilidade e satisfação
acima do mínimo. A pontuação premia equilíbrio: pouca perda, custo baixo e mix sustentável.

## Estrutura

- `index.html` — canvas + HUD
- `css/style.css` — visual (marca ENGIE)
- `js/hex.js` — matemática de hexágono (axial)
- `js/level.js` — dados do Level 1
- `js/game.js` — estado, regras e simulação (energia, custo, conectividade, indicadores, score)
- `js/render.js` — desenho no canvas
- `js/input.js` — interação (paleta + mouse)
- `js/main.js` — bootstrap + HUD + modal

## Status

Throwaway / validação de conceito. O produto final da ENGIE é planejado em Unity Desktop
(ver docs do projeto no vault). Baseado no GDD "Arquiteto da Energia" (Pablo), Level 1.
