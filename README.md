# Simulador de Risco de Alagamento 🌊

Este projeto é uma Prova de Conceito (PoC) de um sistema de monitoramento e previsão de alagamentos para Florianópolis. Ele utiliza dados históricos de chuva, previsões meteorológicas e uma lógica "Fuzzy" (nebulosa) simplificada para determinar o risco de inundação em pontos específicos monitorados por sensores.

## 🧠 Lógica de Negócio Inteligente (Data-Driven)

Este sistema evoluiu de uma fórmula estática para um modelo **inteligente e vivo**, capaz de aprender com o comportamento histórico de cada sensor.

### 1. Simulação de "Personalidade" do Sensor
No mundo real, sensores instalados em locais diferentes reagem de forma única:
- Alguns bueiros entopem com 10mm de chuva.
- Outros, em locais altos, suportam 50mm tranquilamente.

Nosso script de geração (`generate_daily_data.js`) simula isso atribuindo um **Viés Oculto** (Bias) aleatório para cada sensor ao processar o histórico.

### 2. O Processo de Aprendizado (Learning Phase)
Antes de gerar qualquer previsão futura, o sistema **analisa o passado**:
1.  Ele varre todo o histórico gerado.
2.  Identifica, para cada sensor: *"Qual foi a média de chuva nos dias que ele extravasou?"*.
3.  Define um **Limiar Crítico Aprendido** (Learned Threshold) específico para aquele equipamento.

> *Exemplo: O sistema "aprende" que o Sensor S001 costuma alagar com ~8mm, enquanto o S005 só alaga com ~25mm.*

### 3. Previsão Dinâmica
O Score de Risco (0-100) futuro agora é calculado em relação a esse aprendizado:

```javascript
Score = (Chuva Prevista / Limiar Aprendido) * 100
```

Isso significa que uma chuva de **10mm** será:
- **CRÍTICA** para o Sensor S001 (que não aguenta 8mm).
- **BAIXA** para o Sensor S005 (que aguenta 25mm).

Isso torna o sistema adaptável e muito mais preciso do que regras fixas.

---

## 🛠️ Arquitetura e Fluxo de Dados

O sistema é estático (frontend puro), rodando a partir de arquivos JSON pré-processados.

1.  **Entrada de Dados (CSV & Imagens)**:
    *   Recebemos dados climáticos históricos via CSV (`iot_1514...`).
    *   Recebemos previsões futuras manualmente (transcritas de imagens/boletins).

2.  **Processamento (`scripts/generate_daily_data.js`)**:
    *   Um script Node.js lê o CSV e os inputs manuais.
    *   Aplica a lógica descrita acima para cada dia e cada sensor.
    *   Gera arquivos JSON otimizados para o frontend.

3.  **Visualização (`app.js` + `index.html`)**:
    *   Lê `predicoes_fuzzy.json` (Resultados já calculados).
    *   Renderiza o Mapa (Leaflet) e a Tabela.
    *   Permite navegar no tempo (Datas/Cenários).

## 📁 Estrutura de Arquivos

*   `data/`
    *   `sensores.json`: Cadastro fixo dos sensores (Localização + Vulnerabilidade).
    *   `historyu_mm_rain.json`: Histórico consolidado de chuvas (apenas leitura).
    *   `history_sensores.json`: Registro histórico de eventos de alagamento simulados.
    *   `predicoes_fuzzy.json`: **Arquivo Principal**. Contém as datas futuras e o risco calculado para cada sensor.
*   `scripts/`
    *   `generate_daily_data.js`: O "cérebro" que calibra e gera os dados.
*   `app.js`: Lógica de interface (mapa, filtros, cliques).
*   `styles.css` & `index.html`: Layout responsivo.

## 🚀 Como Executar

Simplesmente sirva a pasta raiz com qualquer servidor HTTP estático.

```bash
# Exemplo com npx serve
npx serve .
```

Acesse `http://localhost:3000` no navegador.

---

## 🔄 Como Adicionar Novos Dados

1.  Edite `scripts/generate_daily_data.js`.
2.  Atualize o array `manualForecast` com as novas previsões (Datas e mm de chuva).
3.  Se houver novo CSV histórico, substitua o arquivo em `data/` e atualize a referência no script.
4.  Rode o script:
    ```bash
    node scripts/generate_daily_data.js
    ```
5.  Recarregue a página.
