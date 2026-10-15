; Instalador do Segurança Integral (Inno Setup 6.3 ou mais novo).
; Compilar com o build.ps1, que gera antes dist\SegurancaIntegral\ com o PyInstaller.
;
; O que faz, em ordem:
;   1. para a tarefa e o processo de uma versão anterior (atualização);
;   2. copia o programa para {autopf}\SegurancaIntegral;
;   3. cria a pasta de dados e deixa acesso só para SYSTEM e Administradores;
;   4. grava o config.json com os dois endereços (só se ainda não existir);
;   5. roda --criar-admin e mostra a senha uma vez, na página seguinte (em
;      instalação /SILENT ou /VERYSILENT NÃO cria o admin: a senha não teria
;      onde ser mostrada; a mensagem final manda rodar --criar-admin à mão);
;   6. registra e inicia a tarefa agendada (tarefas.ps1).
; A pasta do programa é fixa ({autopf}\SegurancaIntegral; não use /DIR=):
; o LEIA-ME cita esse caminho.
; Na desinstalação remove programa e tarefa; os dados ficam, salvo se a pessoa
; responder "Sim" à pergunta (padrão "Não").

#if VER < EncodeVer(6,3,0)
  #error É preciso o Inno Setup 6.3 ou mais novo (usa ExecAndCaptureOutput).
#endif

#define AppNome "Segurança Integral"
#define AppVersao "1.0.0"
#define AppExe "SegurancaIntegral.exe"
#define NomeTarefa "SegurancaIntegral"

[Setup]
AppId={{6F1C2B7E-4E0B-4D55-9C7A-2B1F3A9D8E41}
AppName={#AppNome}
AppVersion={#AppVersao}
AppVerName={#AppNome} {#AppVersao}
DefaultDirName={autopf}\SegurancaIntegral
; o LEIA-ME cita este caminho, então a pasta não é escolhida na instalação
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist
OutputBaseFilename=SegurancaIntegral-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
InfoAfterFile=LEIA-ME.txt
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppNome}
; a tarefa e o processo são parados no PrepareToInstall
CloseApplications=no

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[InstallDelete]
; módulos da versão anterior não podem sobrar misturados com os novos
Type: filesandordirs; Name: "{app}\_internal"

[Files]
Source: "tarefas.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "LEIA-ME.txt"; DestDir: "{app}"; Flags: ignoreversion isreadme
Source: "..\dist\SegurancaIntegral\_internal\*"; DestDir: "{app}\_internal"; Flags: ignoreversion recursesubdirs createallsubdirs
; por último: o AfterInstall precisa do programa inteiro já copiado
Source: "..\dist\SegurancaIntegral\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion; AfterInstall: ConfigurarDados

[Code]
var
  PaginaHosts: TInputQueryWizardPage;
  PaginaSenha: TOutputMsgMemoWizardPage;
  TextoFinal: String;

function PastaDados: String;
begin
  Result := ExpandConstant('{commonappdata}\SegurancaIntegral');
end;

function ArquivoConfig: String;
begin
  Result := PastaDados + '\config.json';
end;

{ --- endereços dos portais ------------------------------------------------ }

{ Só letras minúsculas, dígitos, ponto e hífen; pelo menos um ponto; sem
  "https://" nem barra. Um endereço errado aqui faria o servidor recusar
  toda requisição com 400 (validação de Host). }
function HostValido(const Host: String): Boolean;
var
  I: Integer;
  C: Char;
begin
  Result := (Length(Host) >= 4) and (Length(Host) <= 253) and (Pos('.', Host) > 0);
  if not Result then
    Exit;
  if (Host[1] = '.') or (Host[1] = '-') or (Host[Length(Host)] = '.') or (Host[Length(Host)] = '-') then
  begin
    Result := False;
    Exit;
  end;
  for I := 1 to Length(Host) do
  begin
    C := Host[I];
    if not (((C >= 'a') and (C <= 'z')) or ((C >= '0') and (C <= '9')) or (C = '.') or (C = '-')) then
    begin
      Result := False;
      Exit;
    end;
  end;
end;

function HostDigitado(const Indice: Integer): String;
begin
  Result := Lowercase(Trim(PaginaHosts.Values[Indice]));
end;

procedure InitializeWizard;
begin
  PaginaHosts := CreateInputQueryPage(wpSelectDir,
    'Endereços dos portais',
    'Nomes públicos que o túnel vai encaminhar para este computador.',
    'Digite só o nome, sem "https://" e sem barra. Os mesmos nomes serão criados ' +
    'como rotas do túnel (veja o LEIA-ME no fim da instalação).');
  PaginaHosts.Add('Portal do aluno (ex.: escola.exemplo.com.br):', False);
  PaginaHosts.Add('Portal da coordenação (ex.: coordenacao.exemplo.com.br):', False);

  PaginaSenha := CreateOutputMsgMemoPage(wpInstalling,
    'Acesso da coordenação',
    'Anote agora. A senha não será exibida de novo.',
    'Guarde a senha num lugar seguro e troque-a depois do primeiro acesso.',
    '');
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  { atualização: o config.json existente é mantido, então não pergunta }
  Result := (PageID = PaginaHosts.ID) and FileExists(ArquivoConfig);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Aluno, Coord: String;
begin
  Result := True;
  if CurPageID <> PaginaHosts.ID then
    Exit;
  Aluno := HostDigitado(0);
  Coord := HostDigitado(1);
  if not HostValido(Aluno) then
  begin
    MsgBox('Endereço do portal do aluno inválido. Use só o nome, por exemplo escola.exemplo.com.br.', mbError, MB_OK);
    Result := False;
  end
  else if not HostValido(Coord) then
  begin
    MsgBox('Endereço do portal da coordenação inválido. Use só o nome, por exemplo coordenacao.exemplo.com.br.', mbError, MB_OK);
    Result := False;
  end
  else if Aluno = Coord then
  begin
    MsgBox('Os dois portais precisam de endereços diferentes.', mbError, MB_OK);
    Result := False;
  end;
end;

{ --- atualização: parar a versão em execução ------------------------------- }

procedure PararServidor;
var
  Codigo: Integer;
begin
  { desativar antes de encerrar: o gatilho de repetição não religa no meio da cópia }
  Exec(ExpandConstant('{sys}\schtasks.exe'), '/Change /TN "{#NomeTarefa}" /DISABLE', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
  Exec(ExpandConstant('{sys}\schtasks.exe'), '/End /TN "{#NomeTarefa}"', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /T /IM {#AppExe}', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  PararServidor;
  Result := '';
end;

{ --- pasta de dados, admin e tarefa ------------------------------------------ }

function Juntar(const Linhas: TArrayOfString): String;
var
  I: Integer;
begin
  Result := '';
  for I := 0 to GetArrayLength(Linhas) - 1 do
    Result := Result + Linhas[I] + #13#10;
end;

procedure ProtegerPasta;
var
  Codigo: Integer;
begin
  if not ForceDirectories(PastaDados) then
    RaiseException('Não foi possível criar ' + PastaDados + '.');
  { /T também nos arquivos que já existem (reinstalação corrige permissões
    abertas demais). Sem herança; só SYSTEM (S-1-5-18) e Administradores (S-1-5-32-544).
    SIDs e não nomes: no Windows em português o grupo é "Administradores". }
  if not Exec(ExpandConstant('{sys}\icacls.exe'),
      '"' + PastaDados + '" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F /T',
      '', SW_HIDE, ewWaitUntilTerminated, Codigo) or (Codigo <> 0) then
    RaiseException('Não foi possível ajustar as permissões de ' + PastaDados +
      ' (icacls, código ' + IntToStr(Codigo) + ').');
end;

procedure GravarConfig;
var
  Json: String;
begin
  { atualização: nunca sobrescreve o config.json existente }
  if not FileExists(ArquivoConfig) then
  begin
    { 127.0.0.1 e localhost: verificação local de saúde no próprio servidor.
      Em instalação silenciosa a página dos endereços não aparece: só os
      locais entram (o servidor avisa na partida e o LEIA-ME explica como
      acrescentar os do túnel). Nunca grava endereço vazio. }
    if WizardSilent then
      Json := '{' + #13#10 +
        '  "allowed_hosts": ["127.0.0.1", "localhost"]' + #13#10 + '}' + #13#10
    else
      Json := '{' + #13#10 +
        '  "allowed_hosts": ["' + HostDigitado(0) + '", "' + HostDigitado(1) +
        '", "127.0.0.1", "localhost"]' + #13#10 + '}' + #13#10;
    if not SaveStringToFile(ArquivoConfig, Json, False) then
      RaiseException('Não foi possível gravar ' + ArquivoConfig + '.');
  end;
end;

procedure CriarAdmin;
var
  Codigo, I: Integer;
  Saida: TExecOutput;
  Senha: String;
begin
  { instalação silenciosa: não há onde mostrar a senha, então o admin não é
    criado (nem a senha vai para arquivo ou log). A pessoa cria depois. }
  if WizardSilent then
  begin
    TextoFinal := 'Instalação silenciosa: o usuário da coordenação NÃO foi criado.' + #13#10 +
      'Num Prompt de Comando como Administrador, rode:' + #13#10 +
      '"' + ExpandConstant('{app}\{#AppExe}') + '" --data-dir "' + PastaDados +
      '" --criar-admin' + #13#10 +
      'A senha aparece uma vez na tela. Se o usuário já existia, nada muda.';
    Log('Instalação silenciosa: --criar-admin não executado; ver mensagem final.');
    Exit;
  end;

  { a saída fica só na memória: a senha não passa por arquivo }
  if not ExecAndCaptureOutput(ExpandConstant('{app}\{#AppExe}'),
      '--data-dir "' + PastaDados + '" --criar-admin',
      ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, Codigo, Saida) then
    RaiseException('Não foi possível executar {#AppExe}: ' + SysErrorMessage(Codigo));

  if Codigo = 0 then
  begin
    Senha := '';
    for I := 0 to GetArrayLength(Saida.StdOut) - 1 do
      if Pos('Senha inicial:', Saida.StdOut[I]) = 1 then
        Senha := Trim(Copy(Saida.StdOut[I], Length('Senha inicial:') + 1, MaxInt));
    if Senha = '' then
      RaiseException('O usuário foi criado, mas a senha não apareceu na saída. ' +
        'Rode "{#AppExe} --redefinir-senha" num prompt de Administrador.');
    TextoFinal := 'Usuário: coordenacao' + #13#10 + 'Senha: ' + Senha + #13#10 + #13#10 +
      'Esta é a única vez que a senha aparece. Se ela se perder, veja ' +
      '"Esqueci a senha" no LEIA-ME.';
  end
  else if Codigo = 3 then
    TextoFinal := 'O usuário coordenacao já existe; senha não alterada.' + #13#10 +
      'Use a senha atual. Se ela se perdeu, veja "Esqueci a senha" no LEIA-ME.'
  else if Codigo = 4 then
    RaiseException('O programa não conseguiu usar a pasta de dados ou o config.json ' +
      '(código 4):' + #13#10 + Juntar(Saida.StdErr))
  else
    RaiseException('Falha ao criar o usuário da coordenação (código ' + IntToStr(Codigo) +
      '):' + #13#10 + Juntar(Saida.StdErr));
end;

procedure RegistrarTarefa;
var
  Codigo: Integer;
begin
  if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
      '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\tarefas.ps1') + '"' +
      ' -Exe "' + ExpandConstant('{app}\{#AppExe}') + '"' +
      ' -DataDir "' + PastaDados + '" -Iniciar',
      '', SW_HIDE, ewWaitUntilTerminated, Codigo) or (Codigo <> 0) then
    RaiseException('Não foi possível registrar a tarefa agendada {#NomeTarefa} ' +
      '(código ' + IntToStr(Codigo) + ').');
end;

{ AfterInstall do executável: a ordem importa. A permissão vem antes de
  qualquer arquivo (secret.key e banco nascem na pasta já protegida). }
procedure ConfigurarDados;
begin
  ProtegerPasta;
  GravarConfig;
  CriarAdmin;
  RegistrarTarefa;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = PaginaSenha.ID then
    PaginaSenha.RichEditViewer.Lines.Text := TextoFinal;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  { silenciosa: a página da senha não existe; a instrução vai numa mensagem
    final (suprimida só com /SUPPRESSMSGBOXES) e a mesma frase fica no log }
  if (CurStep = ssDone) and WizardSilent and (TextoFinal <> '') then
    SuppressibleMsgBox(TextoFinal, mbInformation, MB_OK, IDOK);
end;

{ --- desinstalação ---------------------------------------------------------- }

procedure RemoverTarefa;
var
  Codigo: Integer;
begin
  Exec(ExpandConstant('{sys}\schtasks.exe'), '/Change /TN "{#NomeTarefa}" /DISABLE', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
  Exec(ExpandConstant('{sys}\schtasks.exe'), '/End /TN "{#NomeTarefa}"', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
  Exec(ExpandConstant('{sys}\schtasks.exe'), '/Delete /TN "{#NomeTarefa}" /F', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /T /IM {#AppExe}', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  { antes de apagar os arquivos: o executável não pode estar rodando }
  if CurUninstallStep = usUninstall then
    RemoverTarefa;

  { os dados ficam por padrão; desinstalação silenciosa nunca apaga }
  if (CurUninstallStep = usPostUninstall) and not UninstallSilent and DirExists(PastaDados) then
  begin
    if MsgBox('O programa foi removido. Os dados continuam em:' + #13#10 + PastaDados + #13#10 + #13#10 +
        'Apagar também os dados (casos, anexos, backups e a chave secreta)? ' +
        'Isso não pode ser desfeito.', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
    begin
      if not DelTree(PastaDados, True, True, True) then
        MsgBox('Não foi possível apagar tudo em ' + PastaDados + '. Apague manualmente.', mbError, MB_OK);
    end;
  end;
end;
