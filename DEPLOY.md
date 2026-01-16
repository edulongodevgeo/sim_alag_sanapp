# Como Deployar na Vercel

Sim, este sistema é **perfeito** para a Vercel, pois é um site estático (HTML/JS/CSS).

## Opção 1: Via GitHub (Recomendado)

1. Crie um repositório no GitHub e suba este código.
2. Vá em [vercel.com](https://vercel.com) e faça login.
3. Clique em **"Add New..."** -> **"Project"**.
4. Importe seu repositório do GitHub.
5. A Vercel detectará automaticamente que é um site estático.
6. Clique em **Deploy**.

## Opção 2: Via Linha de Comando (CLI)

Se você tiver o Node.js instalado:

1. Instale a CLI da Vercel:
   ```bash
   npm i -g vercel
   ```
2. No terminal, dentro da pasta do projeto, rode:
   ```bash
   vercel
   ```
3. Siga as instruções na tela (aceite os defaults).

## Sobre os Dados (`data/`)

O sistema lê os arquivos `.json` na pasta `data`. Como o site é estático, esses arquivos serão servidos como arquivos normais. Se você atualizar os dados (rodando `generate_daily_data.js`), precisará fazer um novo deploy (git push ou rodar `vercel --prod`) para que o site mostre os novos dados.
