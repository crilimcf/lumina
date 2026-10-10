# Lumina — modernização de imagens e fotografias

## Alterações da release única
Sem alterações de PostgreSQL, sem eliminar ficheiros existentes e sem alterar os URLs já publicados.

O ponto de entrada comum api.upload() otimiza fotografias de Feed, Perfil, Chat,
Salas, Momentos, Lumes e Cápsulas. O cliente envia para /uploads/sign
o MIME e tamanho resultantes da otimização e mantém o processo atual de
assinatura, envio direto S3/R2 e confirmação binária no servidor.

- Fotografias JPEG, AVIF, HEIC/HEIF quando descodificáveis: WebP se o
  dispositivo suportar WebP Canvas e houver poupança >= 7%, caso contrário JPEG.
- PNG: PNG sem perdas (incluindo alfa), com alternativa WebP para ficheiros
  acima de 8 MiB. Imagens estáticas passam por Canvas, removendo metadados EXIF.
- WebP animado: preserva animação e ficheiro, com limite 8 MiB; não se
  pode garantir remoção de metadados do WebP animado sem transcodificador dedicado.
- Limite de entrada 60 MiB, 80 megapixels; imagem enviada no máximo 2048px
  por lado maior (sem ampliar); destino máximo 8 MiB.
- Vídeo: não reprocessado; preserva bytes, permissões e fluxos originais.
- Seletores de ficheiro passam a incluir AVIF/HEIC/HEIF, além de JPEG/PNG/WebP.
  Para dispositivos que não conseguem descodificar HEIC/AVIF, a app informa
  claramente como exportar em JPEG/PNG em vez de carregar um ficheiro ilegível.
- Miniaturas fora do ecrã com lazy-load e decoding assíncrono em módulos
  selecionados. Visualizadores de foto em ecrã inteiro continuam prioritários.
- Os objetos históricos continuam a ser servidos sem reprocessamento, evitando
  alterações inesperadas no conteúdo dos utilizadores.

## Limitações explícitas
AVIF é aceite como *entrada* e convertido conforme o suporte do cliente;
uploads AVIF nativos e variantes responsivas por CDN exigem um serviço de
transformação aprovado e não devem ser prometidos nesta entrega.
HEIC depende do descodificador integrado no iOS/Android/browser: não há
conversão HEIC de software incluída sem dependência adicional.
Ainda são precisos testes físicos, especialmente permissão de câmara,
galeria iCloud/HEIC, orientações EXIF, fotografias grandes e redes lentas.

## Critérios de aceitação
CI web/API, builds iOS/Android, WebKit 2/2, PNG alfa, JPEG 3k -> 2k,
vídeo byte-idêntico, SVG recusado, correspondência MIME/tamanho signed PUT.
Depois de publicado: verificar Vercel READY e API Railway SUCCESS/health,
monitorizar erros runtime e medir qualidade/tráfego antes de declarar
ganhos quantitativos reais. PostgreSQL reservado para a fase final.
