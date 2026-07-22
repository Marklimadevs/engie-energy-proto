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

## Fases (seguindo o GDD "Arquiteto da Energia")

- **Fase 1 — Ilumine a Cidade**: Solar, Hidrelétrica, Linha. Geração, transmissão, consumo.
- **Fase 2 — Equilíbrio Energético**: + Eólica, Baterias, IA. Mecânica **dia/noite** (solar zera à
  noite, precisa de eólica/bateria); indicadores Estabilidade e Inovação.
- **Fase 3 — Transição Energética**: + Biomassa, Sensores, Drone, carta de **P&D**. **Duas demandas**
  (cidade + indústria); indicadores Emissões e Lucro.

No protótipo todas as fases ficam liberadas (clique na barra de fases). Também dá para abrir direto
uma fase pela URL: `?fase=2` ou `?fase=3`.

## Como jogar

1. Escolha uma peça na paleta e clique numa célula para colocar.
   - Solar rende mais em célula ensolarada; não gera à noite.
   - Eólica rende com o vento (colinas), gera dia e noite.
   - Hidrelétrica só na água (ou ao lado); firme, mas cara e menos sustentável.
   - Baterias entregam à noite; IA reduz perdas; Sensores/Drone estabilizam; P&D dá inovação.
   - Linha conecta as fontes às demandas; cada segmento custa e gera perda por distância.
2. Ligue as fontes às demandas traçando linhas. Nas fases 2 e 3, use o toggle **Dia/Noite** — a fase
   mais fraca é a que vale para vencer.
3. "Finalizar fase" mostra o resultado, os indicadores e a pontuação.

Vence quem atende a demanda dentro do orçamento **e** mantém os indicadores-alvo acima do mínimo.
A pontuação premia equilíbrio: pouca perda, custo baixo, mix sustentável e limpo.

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
