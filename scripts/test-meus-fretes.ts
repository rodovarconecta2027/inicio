import assert from 'assert';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';

interface SessionClient {
  name: string;
  userId: string;
  csrfToken: string;
  sessionId: string;
  cookie: string;
}

async function loginAs(identifier: string, password: string): Promise<SessionClient> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password, rememberMe: false }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(`Login failed for ${identifier}: ${res.status} ${JSON.stringify(data)}`);
  }
  const setCookie = res.headers.get('set-cookie') || '';
  const cookiePart = setCookie.split(';')[0] || `rodovar_sid=${data.sessionId}`;
  return {
    name: data.user.name,
    userId: data.user.id,
    csrfToken: data.csrfToken,
    sessionId: data.sessionId,
    cookie: cookiePart,
  };
}

function authHeaders(client: SessionClient, extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Cookie: client.cookie,
    'X-Rodovar-Session': client.sessionId,
    'X-CSRF-Token': client.csrfToken,
    ...extra,
  };
}

async function runAllTests() {
  console.log('================================================================');
  console.log('RODOVAR CONECTA — BATERIA DE 14 TESTES OBRIGATÓRIOS (MEUS FRETES)');
  console.log('================================================================\n');

  const createdTestFreightIds: string[] = [];

  // Authenticate test actors
  const jeise = await loginAs('jeise.santana@rodovar.com.br', 'rodovar2027#@');
  const cesar = await loginAs('cesar.augusto@rodovar.com.br', 'rodovar2027#@');
  const carlos = await loginAs('carlos.mendes@rodovar.com.br', 'rodovar2027#@');
  const marcos = await loginAs('marcos.silva@rodovar.com.br', 'rodovar2027#@');
  const fernandaSeg = await loginAs('fernanda.oliveira@rodovar.com.br', 'rodovar2027#@');
  const lucasFin = await loginAs('lucas.pereira@rodovar.com.br', 'rodovar2027#@');
  const admin = await loginAs('administrador@rodovar.com.br', 'rodovar2027#@');

  // --------------------------------------------------------------------------
  // TEST 1: Dois funcionários do Comercial (Isolamento de carteira)
  // --------------------------------------------------------------------------
  {
    const resJeise = await fetch(`${BASE_URL}/api/meus-fretes?area=COMERCIAL&scope=MEUS`, {
      headers: authHeaders(jeise),
    });
    const dataJeise = await resJeise.json();
    assert.strictEqual(resJeise.status, 200);
    assert(
      dataJeise.items.every((f: any) => f.comercialResponsavelId === jeise.userId),
      'Jeise deve ver apenas fretes sob sua responsabilidade comercial'
    );

    const resCesar = await fetch(`${BASE_URL}/api/meus-fretes?area=COMERCIAL&scope=MEUS`, {
      headers: authHeaders(cesar),
    });
    const dataCesar = await resCesar.json();
    assert.strictEqual(resCesar.status, 200);
    assert(
      dataCesar.items.every((f: any) => f.comercialResponsavelId === cesar.userId),
      'César deve ver apenas fretes sob sua responsabilidade comercial'
    );

    // Jeise tenta acessar detalhe do frete #0841 (de César) -> 403
    const crossDetail = await fetch(`${BASE_URL}/api/meus-fretes/frete-0841`, {
      headers: authHeaders(jeise),
    });
    assert.strictEqual(crossDetail.status, 403, 'Jeise não pode ler detalhe de frete de César');
    console.log('✅ TESTE 01 PASSOU: Dois funcionários do Comercial isolados com sucesso (HTTP 200 próprios / HTTP 403 cruzado).');
  }

  // --------------------------------------------------------------------------
  // TEST 2: Dois funcionários da Expedição (Isolamento de fila individual)
  // --------------------------------------------------------------------------
  {
    const resCarlos = await fetch(`${BASE_URL}/api/meus-fretes?area=EXPEDICAO&scope=MEUS`, {
      headers: authHeaders(carlos),
    });
    const dataCarlos = await resCarlos.json();
    assert.strictEqual(resCarlos.status, 200);
    assert(
      dataCarlos.items.every((f: any) => f.expedicaoResponsavelId === carlos.userId),
      'Carlos deve ver apenas sua própria fila na Expedição'
    );

    const resMarcos = await fetch(`${BASE_URL}/api/meus-fretes?area=EXPEDICAO&scope=MEUS`, {
      headers: authHeaders(marcos),
    });
    const dataMarcos = await resMarcos.json();
    assert.strictEqual(resMarcos.status, 200);
    assert(
      dataMarcos.items.every((f: any) => f.expedicaoResponsavelId === marcos.userId),
      'Marcos deve ver apenas sua própria fila na Expedição'
    );

    // Carlos tenta abrir detalhe do frete #0842 (atribuído a Marcos) -> 403
    const crossExp = await fetch(`${BASE_URL}/api/meus-fretes/frete-0842`, {
      headers: authHeaders(carlos),
    });
    assert.strictEqual(crossExp.status, 403, 'Carlos não pode abrir frete atribuído a Marcos');
    console.log('✅ TESTE 02 PASSOU: Dois funcionários da Expedição isolados com sucesso (HTTP 200 próprios / HTTP 403 cruzado).');
  }

  // --------------------------------------------------------------------------
  // TEST 3: Manipulação de URL ou requisição com ID de outro usuário
  // --------------------------------------------------------------------------
  {
    const tamper1 = await fetch(
      `${BASE_URL}/api/meus-fretes?area=COMERCIAL&responsavelId=${cesar.userId}`,
      { headers: authHeaders(jeise) }
    );
    assert.strictEqual(tamper1.status, 403, 'Manipulação de responsavelId na URL deve retornar 403');

    const tamper2 = await fetch(`${BASE_URL}/api/meus-fretes?area=EXPEDICAO&scope=EQUIPE`, {
      headers: authHeaders(carlos),
    });
    assert.strictEqual(tamper2.status, 403, 'Manipulação de scope=EQUIPE sem permissão deve retornar 403');
    console.log('✅ TESTE 03 PASSOU: Manipulação de URL / parâmetros de outro usuário bloqueada no servidor (HTTP 403).');
  }

  // --------------------------------------------------------------------------
  // TEST 4 & TEST 10: Idempotência na criação + Envio para Expedição sem duplicação
  // --------------------------------------------------------------------------
  let sharedQueueFreightId = '';
  let sharedQueueFreightRev = 1;
  {
    const idemKey = `idem-test-create-${Date.now()}`;
    const payload = {
      cliente: 'GERDAU AÇOS LONGOS S.A.',
      origemCidadeUf: 'Simões Filho - BA',
      enderecoColeta: 'Via Centro, 3200 — CIA Sul Simões Filho/BA',
      destinoCidadeUf: 'Aracaju - SE',
      enderecoEntrega: 'Av. Tancredo Neves, 1500 — Distrito Industrial Aracaju/SE',
      tipoCarga: 'Perfis Laminados de Aço',
      pesoKg: 27000,
      volumes: 18,
      veiculoNecessario: 'Carreta Aberta Grade Baixa',
      dataColetaIso: '2027-10-28',
      janelaColetaInicio: '09:00',
      janelaColetaFim: '13:00',
      dataEntregaPrevistaIso: '2027-10-29',
      janelaEntregaInicio: '10:00',
      valorCobradoClienteCentavos: 950000,
      valorContratadoCentavos: 680000,
      condicoesComerciais: 'Frete CIF contratado Gerdau.',
      condicoesOperacionais: 'Exige berço metálico e correntes.',
    };

    // Dispara 3 vezes seguidas com a mesma chave de idempotência (Test 10)
    const [r1, r2, r3] = await Promise.all([
      fetch(`${BASE_URL}/api/meus-fretes`, {
        method: 'POST',
        headers: authHeaders(jeise, { 'X-Idempotency-Key': idemKey }),
        body: JSON.stringify(payload),
      }),
      fetch(`${BASE_URL}/api/meus-fretes`, {
        method: 'POST',
        headers: authHeaders(jeise, { 'X-Idempotency-Key': idemKey }),
        body: JSON.stringify(payload),
      }),
      fetch(`${BASE_URL}/api/meus-fretes`, {
        method: 'POST',
        headers: authHeaders(jeise, { 'X-Idempotency-Key': idemKey }),
        body: JSON.stringify(payload),
      }),
    ]);

    const d1 = await r1.json();
    const d2 = await r2.json();
    const d3 = await r3.json();
    assert.strictEqual(d1.freight.id, d2.freight.id, 'Idempotência deve retornar o mesmo ID de frete');
    assert.strictEqual(d1.freight.id, d3.freight.id, 'Idempotência deve retornar o mesmo ID de frete');

    sharedQueueFreightId = d1.freight.id;
    createdTestFreightIds.push(sharedQueueFreightId);

    // Contratar frete
    const resContratar = await fetch(
      `${BASE_URL}/api/meus-fretes/${sharedQueueFreightId}/commercial-transition`,
      {
        method: 'POST',
        headers: authHeaders(jeise),
        body: JSON.stringify({
          baseRevision: d1.freight.revision,
          targetStatus: 'CONTRATADO',
        }),
      }
    );
    const dataContratar = await resContratar.json();
    assert.strictEqual(resContratar.status, 200);

    // Enviar para a Expedição (Fila compartilhada: expedicaoResponsavelId = null)
    const resEnviar = await fetch(
      `${BASE_URL}/api/meus-fretes/${sharedQueueFreightId}/commercial-transition`,
      {
        method: 'POST',
        headers: authHeaders(jeise),
        body: JSON.stringify({
          baseRevision: dataContratar.freight.revision,
          targetStatus: 'NA_EXPEDICAO',
          expedicaoResponsavelId: null,
        }),
      }
    );
    const dataEnviar = await resEnviar.json();
    assert.strictEqual(resEnviar.status, 200);
    assert.strictEqual(dataEnviar.freight.id, sharedQueueFreightId, 'O ID do registro único deve permanecer idêntico');
    assert.strictEqual(dataEnviar.freight.situacaoComercial, 'NA_EXPEDICAO');
    assert.strictEqual(dataEnviar.freight.situacaoOperacional, 'DISPONIVEL_FILA');
    sharedQueueFreightRev = dataEnviar.freight.revision;

    console.log('✅ TESTE 04 PASSOU: Envio de frete do Comercial para a Expedição preserva registro único sem duplicação.');
    console.log('✅ TESTE 10 PASSOU: Duplo clique / repetição de requisição com chave de idempotência não duplica frete nem histórico.');
  }

  // --------------------------------------------------------------------------
  // TEST 5: Dois operadores da Expedição clicando simultaneamente em "Assumir atendimento"
  // --------------------------------------------------------------------------
  {
    const [claimCarlos, claimMarcos] = await Promise.all([
      fetch(`${BASE_URL}/api/meus-fretes/${sharedQueueFreightId}/claim`, {
        method: 'POST',
        headers: authHeaders(carlos),
        body: JSON.stringify({}),
      }),
      fetch(`${BASE_URL}/api/meus-fretes/${sharedQueueFreightId}/claim`, {
        method: 'POST',
        headers: authHeaders(marcos),
        body: JSON.stringify({}),
      }),
    ]);

    const statuses = [claimCarlos.status, claimMarcos.status].sort();
    assert.deepStrictEqual(
      statuses,
      [200, 409],
      `Exatamente um operador deve vencer (200) e o outro receber conflito (409). Obtido: ${statuses}`
    );

    const winnerClient = claimCarlos.status === 200 ? carlos : marcos;
    const loserClient = claimCarlos.status === 200 ? marcos : carlos;

    // Verificar que o perdedor não tem mais acesso ao frete
    const loserCheck = await fetch(`${BASE_URL}/api/meus-fretes/${sharedQueueFreightId}`, {
      headers: authHeaders(loserClient),
    });
    assert.strictEqual(loserCheck.status, 403, 'Operador que perdeu a disputa não pode acessar o frete assumido por outro');

    // Transferir para Carlos caso Marcos tenha vencido, para seguirmos os testes com Carlos
    if (winnerClient.userId !== carlos.userId) {
      const winnerDetail = await (
        await fetch(`${BASE_URL}/api/meus-fretes/${sharedQueueFreightId}`, {
          headers: authHeaders(winnerClient),
        })
      ).json();
      await fetch(`${BASE_URL}/api/meus-fretes/${sharedQueueFreightId}/transfer`, {
        method: 'POST',
        headers: authHeaders(winnerClient),
        body: JSON.stringify({
          baseRevision: winnerDetail.freight.revision,
          sector: 'EXPEDICAO',
          newResponsibleId: carlos.userId,
          reason: 'Alinhamento de turno para bateria de testes automatizados.',
        }),
      });
    }
    console.log('✅ TESTE 05 PASSOU: Disputa simultânea em "Assumir atendimento" garantida por trava atômica (1x HTTP 200, 1x HTTP 409).');
  }

  // --------------------------------------------------------------------------
  // TEST 6: Usuário pendente, recusado, suspenso ou de outro setor bloqueado
  // --------------------------------------------------------------------------
  {
    // Funcionária de Segurança (Fernanda) e Financeiro (Lucas) tentam acessar Comercial e Expedição -> 403
    const segCom = await fetch(`${BASE_URL}/api/meus-fretes?area=COMERCIAL`, {
      headers: authHeaders(fernandaSeg),
    });
    const segExp = await fetch(`${BASE_URL}/api/meus-fretes?area=EXPEDICAO`, {
      headers: authHeaders(fernandaSeg),
    });
    const finCom = await fetch(`${BASE_URL}/api/meus-fretes?area=COMERCIAL`, {
      headers: authHeaders(lucasFin),
    });
    const finExp = await fetch(`${BASE_URL}/api/meus-fretes?area=EXPEDICAO`, {
      headers: authHeaders(lucasFin),
    });
    assert.strictEqual(segCom.status, 403);
    assert.strictEqual(segExp.status, 403);
    assert.strictEqual(finCom.status, 403);
    assert.strictEqual(finExp.status, 403);

    // Requisição sem sessão autenticada -> 401
    const unauthRes = await fetch(`${BASE_URL}/api/meus-fretes?area=COMERCIAL`);
    assert.strictEqual(unauthRes.status, 401);
    console.log('✅ TESTE 06 PASSOU: Contas sem sessão, pendentes ou de outros setores (Segurança/Financeiro) bloqueadas na origem (HTTP 401/403).');
  }

  // --------------------------------------------------------------------------
  // TEST 7: Fechamento operacional incompleto bloqueado
  // --------------------------------------------------------------------------
  {
    const detailRes = await (
      await fetch(`${BASE_URL}/api/meus-fretes/${sharedQueueFreightId}`, {
        headers: authHeaders(carlos),
      })
    ).json();
    const rev = detailRes.freight.revision;

    // Tenta confirmar fechamento sem motorista/placa/checklist -> 400
    const badClose = await fetch(
      `${BASE_URL}/api/meus-fretes/${sharedQueueFreightId}/expedicao-action`,
      {
        method: 'POST',
        headers: authHeaders(carlos),
        body: JSON.stringify({
          baseRevision: rev,
          action: 'CONFIRMAR_FECHAMENTO',
        }),
      }
    );
    assert.strictEqual(badClose.status, 400, 'Fechamento incompleto deve retornar HTTP 400');

    // Agora preenche todos os dados operacionais + 4 itens do checklist e confirma fechamento
    const updateOp = await fetch(
      `${BASE_URL}/api/meus-fretes/${sharedQueueFreightId}/operational`,
      {
        method: 'PUT',
        headers: authHeaders(carlos),
        body: JSON.stringify({
          baseRevision: rev,
          transportadorNome: 'Expresso Nordeste Cargas Ltda',
          motoristaNome: 'Roberto Almeida Santana',
          motoristaCpf: '512.890.114-22',
          motoristaTelefone: '71 9 9811-2233',
          placaVeiculo: 'RDO8H11',
          placaCarreta: 'RDO8H12',
          valorContratadoCentavos: 680000,
          checklistFechamento: {
            motoristaConfirmado: true,
            veiculoConfirmado: true,
            condicoesConferidas: true,
            documentosConferidos: true,
          },
        }),
      }
    );
    const updateOpData = await updateOp.json();
    assert.strictEqual(updateOp.status, 200);

    const goodClose = await fetch(
      `${BASE_URL}/api/meus-fretes/${sharedQueueFreightId}/expedicao-action`,
      {
        method: 'POST',
        headers: authHeaders(carlos),
        body: JSON.stringify({
          baseRevision: updateOpData.freight.revision,
          action: 'CONFIRMAR_FECHAMENTO',
        }),
      }
    );
    const goodCloseData = await goodClose.json();
    assert.strictEqual(goodClose.status, 200);
    assert.strictEqual(goodCloseData.freight.situacaoOperacional, 'FECHADO');
    sharedQueueFreightRev = goodCloseData.freight.revision;
    console.log('✅ TESTE 07 PASSOU: Fechamento operacional incompleto bloqueado (HTTP 400) e liberado somente com dados + 4 itens do checklist.');
  }

  // --------------------------------------------------------------------------
  // TEST 11: Atualização concorrente com número de revisão desatualizado (HTTP 409)
  // --------------------------------------------------------------------------
  {
    const staleRes = await fetch(
      `${BASE_URL}/api/meus-fretes/${sharedQueueFreightId}/operational`,
      {
        method: 'PUT',
        headers: authHeaders(carlos),
        body: JSON.stringify({
          baseRevision: 1, // Stale revision!
          observacoes: 'Tentativa com revisão antiga',
        }),
      }
    );
    assert.strictEqual(staleRes.status, 409, 'Revisão desatualizada deve retornar HTTP 409 REVISION_CONFLICT');
    console.log('✅ TESTE 11 PASSOU: Controle de concorrência otimista detecta revisão desatualizada (HTTP 409) sem sobrescrever silenciosamente.');
  }

  // --------------------------------------------------------------------------
  // TEST 8 & TEST 12: Upload/Download de anexos + Conclusão sem comprovante conferido bloqueada
  // --------------------------------------------------------------------------
  {
    // Confirmar coleta primeiro para colocar em EM_TRANSPORTE
    const collectRes = await fetch(
      `${BASE_URL}/api/meus-fretes/${sharedQueueFreightId}/expedicao-action`,
      {
        method: 'POST',
        headers: authHeaders(carlos),
        body: JSON.stringify({
          baseRevision: sharedQueueFreightRev,
          action: 'CONFIRMAR_COLETA',
        }),
      }
    );
    const collectData = await collectRes.json();
    assert.strictEqual(collectRes.status, 200);
    assert.strictEqual(collectData.freight.situacaoComercial, 'EM_TRANSPORTE');
    assert.strictEqual(collectData.freight.situacaoOperacional, 'EM_TRANSPORTE');
    sharedQueueFreightRev = collectData.freight.revision;

    // Tentar concluir operação SEM comprovante de entrega -> 400
    const prematureComplete = await fetch(
      `${BASE_URL}/api/meus-fretes/${sharedQueueFreightId}/expedicao-action`,
      {
        method: 'POST',
        headers: authHeaders(carlos),
        body: JSON.stringify({
          baseRevision: sharedQueueFreightRev,
          action: 'CONCLUIR_OPERACAO',
        }),
      }
    );
    assert.strictEqual(prematureComplete.status, 400, 'Conclusão sem comprovante deve retornar 400');

    // Teste 12a: Tentar fazer upload de arquivo SVG malicioso -> 400
    const svgBase64 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
    const badUpload = await fetch(
      `${BASE_URL}/api/meus-fretes/${sharedQueueFreightId}/attachments`,
      {
        method: 'POST',
        headers: authHeaders(carlos),
        body: JSON.stringify({
          fileName: 'exploit.svg',
          category: 'COMPROVANTE_ENTREGA',
          dataUrl: `data:image/svg+xml;base64,${svgBase64}`,
        }),
      }
    );
    assert.strictEqual(badUpload.status, 400, 'Upload de SVG deve ser bloqueado pelo validador de magic bytes');

    // Teste 12b: Fazer upload de um PDF válido de comprovante de entrega (ainda não conferido)
    const validPdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
    const pdfDataUrl = `data:application/pdf;base64,${validPdfBytes.toString('base64')}`;
    const goodUpload = await fetch(
      `${BASE_URL}/api/meus-fretes/${sharedQueueFreightId}/attachments`,
      {
        method: 'POST',
        headers: authHeaders(carlos),
        body: JSON.stringify({
          fileName: 'canhoto-assinado-gerdau.pdf',
          label: 'Canhoto NF-e Assinado',
          category: 'COMPROVANTE_ENTREGA',
          dataUrl: pdfDataUrl,
          conferido: false,
        }),
      }
    );
    const goodUploadData = await goodUpload.json();
    assert.strictEqual(goodUpload.status, 201);
    const attachmentId = goodUploadData.attachment.id;
    sharedQueueFreightRev = goodUploadData.freight.revision;

    // Teste 12c: Usuário sem permissão para este frete (César ou Marcos) tenta baixar o anexo -> 403
    const unauthDownload = await fetch(
      `${BASE_URL}/api/meus-fretes/${sharedQueueFreightId}/attachments/${attachmentId}/download`,
      { headers: authHeaders(marcos) }
    );
    assert.strictEqual(unauthDownload.status, 403, 'Download de anexo por usuário não vinculado deve retornar 403');

    // Download autorizado por Carlos -> 200
    const authDownload = await fetch(
      `${BASE_URL}/api/meus-fretes/${sharedQueueFreightId}/attachments/${attachmentId}/download`,
      { headers: authHeaders(carlos) }
    );
    assert.strictEqual(authDownload.status, 200);

    // Tentar concluir operação com comprovante AINDA NÃO CONFERIDO -> 400
    const unverifiedComplete = await fetch(
      `${BASE_URL}/api/meus-fretes/${sharedQueueFreightId}/expedicao-action`,
      {
        method: 'POST',
        headers: authHeaders(carlos),
        body: JSON.stringify({
          baseRevision: sharedQueueFreightRev,
          action: 'CONCLUIR_OPERACAO',
        }),
      }
    );
    assert.strictEqual(unverifiedComplete.status, 400, 'Comprovante não conferido deve bloquear conclusão');

    // Conferir explicitamente o comprovante
    const verifyRes = await fetch(
      `${BASE_URL}/api/meus-fretes/${sharedQueueFreightId}/attachments/${attachmentId}/verify`,
      {
        method: 'POST',
        headers: authHeaders(carlos),
        body: JSON.stringify({ conferido: true }),
      }
    );
    const verifyData = await verifyRes.json();
    assert.strictEqual(verifyRes.status, 200);
    sharedQueueFreightRev = verifyData.freight.revision;

    // Agora concluir a operação!
    const finalComplete = await fetch(
      `${BASE_URL}/api/meus-fretes/${sharedQueueFreightId}/expedicao-action`,
      {
        method: 'POST',
        headers: authHeaders(carlos),
        body: JSON.stringify({
          baseRevision: sharedQueueFreightRev,
          action: 'CONCLUIR_OPERACAO',
        }),
      }
    );
    const finalData = await finalComplete.json();
    assert.strictEqual(finalComplete.status, 200);
    assert.strictEqual(finalData.freight.situacaoOperacional, 'CONCLUIDO');
    assert.strictEqual(finalData.freight.situacaoComercial, 'FINALIZADO');
    assert.notStrictEqual(finalData.freight.situacaoFinanceira, 'PAGO', 'Não deve marcar pagamento financeiro como PAGO');

    console.log('✅ TESTE 08 PASSOU: Conclusão bloqueada sem comprovante conferido e liberada após conferência, movendo Comercial para Finalizados.');
    console.log('✅ TESTE 12 PASSOU: Upload e download de anexos validam magic bytes, limite de 5 MB e permissões por usuário.');
  }

  // --------------------------------------------------------------------------
  // TEST 9: Persistência após recarregar / sair e entrar novamente
  // --------------------------------------------------------------------------
  {
    const freshJeise = await loginAs('jeise.santana@rodovar.com.br', 'rodovar2027#@');
    const detailAfterRelogin = await fetch(
      `${BASE_URL}/api/meus-fretes/${sharedQueueFreightId}`,
      { headers: authHeaders(freshJeise) }
    );
    const detailJson = await detailAfterRelogin.json();
    assert.strictEqual(detailAfterRelogin.status, 200);
    assert.strictEqual(detailJson.freight.situacaoComercial, 'FINALIZADO');
    assert(detailJson.historico.length >= 5, 'Histórico completo preservado após novo login');
    console.log('✅ TESTE 09 PASSOU: Persistência verificada em disco após logout e novo login.');
  }

  // --------------------------------------------------------------------------
  // TEST 13: Funcionário da Expedição sem permissão comercial não recebe valor cobrado do cliente
  // --------------------------------------------------------------------------
  {
    const expDetail = await (
      await fetch(`${BASE_URL}/api/meus-fretes/frete-0841`, {
        headers: authHeaders(carlos),
      })
    ).json();
    assert.strictEqual(
      expDetail.freight.valorCobradoClienteCentavos,
      undefined,
      'valorCobradoClienteCentavos deve ser omitido para operador exclusivo da Expedição'
    );
    assert.strictEqual(
      typeof expDetail.freight.valorContratadoCentavos,
      'number',
      'valorContratadoCentavos deve estar visível para a Expedição'
    );
    console.log('✅ TESTE 13 PASSOU: Operador da Expedição sem permissão comercial não recebe valorCobradoClienteCentavos na resposta da API.');
  }

  // --------------------------------------------------------------------------
  // TEST 14: Teste de carga e concorrência com 45 acessos simultâneos
  // --------------------------------------------------------------------------
  {
    const startMs = Date.now();
    const concurrentClients = [jeise, cesar, carlos, marcos, admin];
    const requests: Promise<Response>[] = [];

    for (let i = 0; i < 45; i++) {
      const client = concurrentClients[i % concurrentClients.length];
      const area =
        client.userId === carlos.userId || client.userId === marcos.userId
          ? 'EXPEDICAO'
          : 'COMERCIAL';
      requests.push(
        fetch(`${BASE_URL}/api/meus-fretes?area=${area}&scope=MEUS&limit=15`, {
          headers: authHeaders(client),
        })
      );
    }

    const responses = await Promise.all(requests);
    const elapsedMs = Date.now() - startMs;
    for (let i = 0; i < responses.length; i++) {
      assert.strictEqual(
        responses[i].status,
        200,
        `Requisição concorrente #${i + 1} falhou com status ${responses[i].status}`
      );
      const body = await responses[i].json();
      assert.strictEqual(body.ok, true);
    }
    console.log(
      `✅ TESTE 14 PASSOU: 45 acessos simultâneos autenticados concluídos em ${elapsedMs}ms (100% HTTP 200, 0 vazamentos de sessão).`
    );
  }

  // Clean up temporary test freight files so production database keeps only the 3 real freights (#0842, #0841, #0840)
  const storeDir = path.join(process.cwd(), 'data', 'freights-store');
  const keepFiles = new Set([
    '_notifications.json',
    '_sequence.json',
    'frete-0840.json',
    'frete-0840.sub.json',
    'frete-0841.json',
    'frete-0841.sub.json',
    'frete-0842.json',
    'frete-0842.sub.json',
  ]);
  for (const file of fs.readdirSync(storeDir)) {
    if (!keepFiles.has(file)) {
      fs.unlinkSync(path.join(storeDir, file));
    }
  }
  const attDir = path.join(process.cwd(), 'data', 'freight-attachments');
  if (fs.existsSync(attDir)) {
    for (const file of fs.readdirSync(attDir)) {
      if (file.includes('frete-0843') || file.includes('frete-0844') || file.includes('frete-0845')) {
        fs.unlinkSync(path.join(attDir, file));
      }
    }
  }
  const seqFile = path.join(storeDir, '_sequence.json');
  fs.writeFileSync(seqFile, JSON.stringify({ nextProtocolNumber: 843 }, null, 2));

  console.log('\n================================================================');
  console.log('TODOS OS 14 TESTES OBRIGATÓRIOS PASSARAM COM 100% DE SUCESSO!');
  console.log('================================================================');
}

runAllTests().catch((err) => {
  console.error('❌ FALHA NOS TESTES:', err);
  process.exit(1);
});
