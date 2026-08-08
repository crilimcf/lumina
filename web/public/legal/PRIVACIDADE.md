# Política de Privacidade

**Versão 2026-08-08**

> ⚠️ **Rascunho.** Descreve com rigor o que o código faz, mas a conformidade
> legal depende de coisas que estão fora do código: onde alojas, que contratos
> assinaste, se transferes dados para fora da UE. Confirma com quem perceba de
> proteção de dados antes de publicar.
>
> Os campos entre `[colchetes]` têm de ser preenchidos por ti.

---

## Quem trata os teus dados

`[Nome legal]`, com sede em `[morada]`, NIF `[NIF]`.
Contacto para privacidade: `[email]`.

`[Se tiveres encarregado de proteção de dados, indica-o aqui. À tua escala
provavelmente não é obrigatório, mas confirma.]`

---

## O que recolhemos e porquê

### Para teres conta

| Dado | Porquê | Base legal |
|---|---|---|
| Nome e nome de utilizador | Identificar-te na app | Execução do contrato |
| Email | Entrar, recuperar password, avisos importantes | Execução do contrato |
| Password | Guardada em hash bcrypt. **Não a conseguimos ler.** | Execução do contrato |
| Data de nascimento | Aplicar a política 16+ da Lumina | Execução do contrato |
| Data em que aceitaste os termos | Registar a versão dos termos que aceitaste | Execução do contrato |

A Lumina escolheu ser um serviço **16+ como política do produto**. Este limite
não é apresentado como a idade mínima legal de consentimento digital em
Portugal.

### Quando usas a app

| Dado | Porquê | Base legal |
|---|---|---|
| Publicações, comentários, reações | É o serviço | Execução do contrato |
| Imagens que envias | É o serviço | Execução do contrato |
| Mensagens privadas | É o serviço | Execução do contrato |
| Comunidades a que pertences | Mostrar-te o feed certo | Execução do contrato |
| Convites que propões e votos | Escolher o convite do dia | Execução do contrato |
| Dias em que respondeste | Mostrar-te o teu registo | Execução do contrato |
| Momentos (foto ou só cor, 24h) e quem os viu | É o serviço | Execução do contrato |

### Para segurança

| Dado | Porquê | Base legal |
|---|---|---|
| Tentativas de entrada (email, IP, êxito) | Travar ataques a contas | Interesse legítimo |
| Sessões ativas (dispositivo, IP) | Deixares-te ver e fechar sessões | Interesse legítimo |
| Denúncias que fazes | Moderação | Interesse legítimo |
| Registo de decisões de moderação | Responder a queixas sobre decisões | Interesse legítimo |

**O que não recolhemos:** localização, contactos do telemóvel, histórico de
navegação fora da Lumina, dados de outras apps. Não há rastreadores de terceiros
nem publicidade.

---

## Cookies

Não usamos cookies de publicidade nem de análise.

Para manter a sessão iniciada usamos um **cookie estritamente necessário** de
sessão, com `Secure`, `HttpOnly`, `SameSite=Lax` e âmbito do próprio site. O
JavaScript da página não consegue ler esse cookie. Ele serve apenas para
identificar a sessão perante a Lumina e não para te seguir entre sites.

Para pedidos que alteram dados usamos também uma proteção CSRF associada à
sessão. O valor necessário é mantido apenas em memória pela aplicação e não é
um identificador publicitário.

---

## Quem mais toca nos teus dados

Trabalhamos com estes prestadores, cada um com contrato de subcontratação:

| Prestador | Para quê | Onde |
|---|---|---|
| Railway | Servidor e base de dados | UE (europe-west4) |
| Vercel | Servir a aplicação | `[região]` |
| Resend | Enviar emails de recuperação | `[região]` — ainda não configurado |
| Cloudflare R2 | Guardar as imagens | `[região]` — ainda não configurado |

`[Para os restantes prestadores, se algum tratar dados fora do Espaço
Económico Europeu, indica aqui as garantias aplicáveis. Escolher regiões
europeias evita a questão — é o que já foi feito para o alojamento.]`

Não vendemos dados a ninguém. Não os cedemos para publicidade. Só os
entregamos a autoridades quando a lei nos obrigar.

---

## Quanto tempo guardamos

| Dado | Quanto tempo |
|---|---|
| Conta e conteúdo | Enquanto tiveres conta ou até apagares esse conteúdo |
| Depois de pedires o apagamento | 30 dias, para poderes mudar de ideias |
| Mensagens efémeras | O conteúdo é purgado quando expira; a limpeza corre continuamente e fica apenas o registo de que a mensagem existiu |
| Fotos “uma vez” | Depois de abertas, expiram no prazo configurado e o conteúdo é purgado; não prometemos impedir capturas de ecrã |
| Momentos | Deixam de ser visíveis às 24 horas; o job de limpeza remove depois a linha e o ficheiro associado |
| Uploads abandonados | Ficheiros que não chegam a ser usados são eliminados pelos jobs de limpeza |
| Tentativas de entrada | `[90]` dias |
| Registo de moderação | `[2]` anos, para poder responder a queixas |
| Pedidos de recuperação de password | 1 hora até expirarem; apagados ao fim de 7 dias |

Quando uma imagem pertence a conteúdo efémero ou a um Momento, a Lumina remove
também o objeto do armazenamento assim que o job de expiração consegue
concluir. Se o fornecedor de armazenamento estiver temporariamente indisponível,
o conteúdo já expirado deixa de ser servido pela aplicação e a remoção física
fica pendente para nova tentativa.

---

## Os teus direitos

O RGPD dá-te estes direitos, e todos funcionam na app:

**Aceder e levar os teus dados.** Perfil → *Descarregar tudo*. Recebes um
ficheiro JSON com tudo o que temos sobre ti.

**Corrigir.** Perfil → editar. Se houver algo que não consegues corrigir
sozinho, escreve-nos.

**Apagar.** Perfil → *Apagar conta*. Fica agendado para 30 dias depois; entrar
outra vez cancela. O processo remove também os ficheiros que pertencem à conta e
retira referências derivadas, como imagens copiadas por uma republicação.

**Opor-te e limitar o tratamento.** Escreve para `[email]` a explicar o que
pretendes.

**Reclamar.** Se achares que tratámos mal os teus dados, podes apresentar
reclamação à Comissão Nacional de Proteção de Dados — [cnpd.pt](https://www.cnpd.pt).

Respondemos a qualquer pedido no prazo de **30 dias**.

---

## Segurança

- Passwords guardadas com bcrypt, fator de custo 12. Ninguém as consegue ler.
- Toda a comunicação é cifrada em trânsito (HTTPS).
- Sessão em cookie `HttpOnly`, em vez de token legível em `localStorage`.
- Autenticação em dois passos disponível.
- Bloqueio progressivo após tentativas falhadas.
- Imagens verificadas pela assinatura do ficheiro, tamanho real e ownership antes de serem usadas.
- Um upload confirmado é consumido por um único conteúdo criado pelo utilizador, reduzindo reutilização indevida de URLs.

**O que não te podemos prometer:** as mensagens privadas **não** têm cifragem
ponto a ponto. Estão cifradas em trânsito e o acesso está restringido, mas
tecnicamente conseguiríamos lê-las. Preferimos dizer-te isto a deixar-te
assumir o contrário.

---

## Se houver uma falha de segurança

Se acontecer uma falha que ponha os teus dados em risco, notificamos a CNPD nas
72 horas seguintes quando a lei assim o exigir e avisamos-te diretamente se o
risco for elevado.

---

## Menores

A Lumina é para maiores de 16 anos por decisão do produto. Se souberes de uma
conta de alguém com menos de 16 anos, escreve para `[email]` e tratamos do caso.

---

## Alterações

Se mudarmos alguma coisa relevante, avisamos com `[15]` dias de antecedência
pela app ou por email.
