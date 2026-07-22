# CLAUDE.md — Arquiteto da Energia (protótipo web)

## O que é
Protótipo throwaway de gameplay do jogo phygital da ENGIE (cliente Cafundó). Valida o loop
"levar energia à cidade buscando equilíbrio". NÃO é o produto final (que será Unity Desktop).

## Stack
HTML + Canvas + JavaScript vanilla (ES5/ES6, scripts clássicos com namespace `window.EEP`).
Sem build, sem dependências, sem framework. Roda abrindo `index.html` (ideal via servidor estático).

## Convenções
- Sem emojis (regra global do dono).
- Módulos via `window.EEP.*` carregados em ordem no `index.html` (hex → level → game → render → input → main).
- Level e parâmetros de balanceamento ficam em `js/level.js` (`params`).
- Regras de gameplay e simulação em `js/game.js` (`simulate()`).

## Referências (vault Obsidian)
- GDD canônico: "ENGIE — Arquiteto da Energia (GDD Pablo)".
- Proposta e arquitetura: pasta `Profissional/Cafundo/ENGIE-JogoEnergia/`.

## Como estender
- Novo tipo de peça: adicionar regra em `game.apply()` + saída em `sourceOutput()` + efeito nos
  indicadores em `simulate()` + ícone em `render.js` + botão na paleta (`index.html`).
- Novo level: nova função `buildLevelN()` no padrão de `buildLevel1()`.
