# RODOVAR CONECTA — Compatibilidade Mobile e Arquitetura de Share Extension no iOS (iPhone)

## 1. Visão Geral de Compatibilidade por Plataforma

| Plataforma | Mecanismo Implantado no PWA Web | Comportamento no Menu "Compartilhar" do Banco |
| :--- | :--- | :--- |
| **Android (Chrome / Edge + PWA Instalado)** | **Web Share Target API** (`manifest.json` + Service Worker `/sw.js` + `POST /receber-comprovante`) | O aplicativo instalado aparece diretamente como **“Rodovar Conecta”** no menu nativo *Compartilhar* do Android ao enviar PDF, JPEG ou PNG do aplicativo do banco. |
| **iPhone / iPad (iOS Safari + Tela de Início)** | **Anexação Rápida via Arquivos / Fotos** (`<input type="file" accept="application/pdf,image/jpeg,image/png">` + `/receber-comprovante`) | O iOS/WebKit **não registra Web App Manifests (`share_target`)** no menu nativo *Compartilhar* (`UIActivityViewController`) do sistema operacional. No iPhone, o usuário salva/envia o comprovante para *Arquivos* ou *Fotos* e anexa no Rodovar Conecta com 1 toque. |

---

## 2. O Que é Necessário para Aparecer Diretamente no Menu "Compartilhar" do iPhone (iOS Nativo)

Para que o **Rodovar Conecta** apareça diretamente como ícone de destino dentro da folha de compartilhamento nativa do iOS (`UIActivityViewController`) ao sair do aplicativo do banco no iPhone, a Apple exige um pacote nativo assinado na App Store / TestFlight contendo uma **iOS Share Extension**:

### 2.1. Empacotamento Híbrido ou Nativo (Capacitor / Swift)
1. Empacotar o frontend web do **Rodovar Conecta** com **Capacitor iOS** (`@capacitor/ios`) ou `WKWebView` nativo sob o Bundle ID corporativo (ex.: `br.com.rodovar.conecta`).
2. Adicionar um Target secundário no Xcode do tipo **Share Extension** (`br.com.rodovar.conecta.ShareExtension`).

### 2.2. Configuração de `Info.plist` da Share Extension (`NSExtensionActivationRule`)
No arquivo `Info.plist` da extensão iOS, declarar suporte explícito para arquivos PDF e imagens e rejeitar URLs puras sem arquivo:

```xml
<key>NSExtension</key>
<dict>
  <key>NSExtensionPointIdentifier</key>
  <string>com.apple.share-services</string>
  <key>NSExtensionPrincipalClass</key>
  <string>$(PRODUCT_MODULE_NAME).ShareViewController</string>
  <key>NSExtensionAttributes</key>
  <dict>
    <key>NSExtensionActivationRule</key>
    <dict>
      <key>NSExtensionActivationSupportsFileWithMaxCount</key>
      <integer>1</integer>
      <key>NSExtensionActivationSupportsImageWithMaxCount</key>
      <integer>1</integer>
    </dict>
  </dict>
</dict>
```

### 2.3. App Groups para Compartilhamento Seguro de Container (`group.br.com.rodovar.conecta`)
1. Habilitar a capability **App Groups** (`group.br.com.rodovar.conecta`) tanto no Target principal quanto na `ShareExtension`.
2. Quando o usuário compartilha o PDF (`com.adobe.pdf`) ou imagem (`public.jpeg`, `public.png`) no aplicativo do banco:
   - O `ShareViewController` lê o arquivo via `NSItemProvider.loadFileRepresentation(forTypeIdentifier:)`.
   - Valida o tamanho máximo de **10 MB** e grava o binário temporariamente no container compartilhado `FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.br.com.rodovar.conecta")`.
   - Abre o aplicativo principal via Custom URL Scheme / Universal Link (`rodovarconecta://receber-comprovante?iosShareId=...`), que injeta o arquivo na rota `/receber-comprovante` do **Rodovar Conecta** exatamente como o Service Worker faz no Android.
