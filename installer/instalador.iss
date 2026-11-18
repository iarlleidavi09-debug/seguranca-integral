; Instalador do TETRAGUARD (Inno Setup 6.3 ou mais novo).
; Compilar com o build.ps1, que gera antes dist\SegurancaIntegral\ com o PyInstaller.
;
; O que faz, em ordem:
;   1. para a tarefa e o processo de uma versão anterior (atualização);
;   2. copia o programa para {autopf}\SegurancaIntegral;
;   3. cria a pasta de dados e deixa acesso só para SYSTEM e Administradores;
;   4. grava o config.json com os dois endereços (só se ainda não existir);
;   5. registra e inicia a tarefa agendada (tarefas.ps1).
; Não cria nenhuma conta: o primeiro acesso ao portal da coordenação, aberto no
; próprio servidor, mostra a tela de criação do administrador.
; A pasta do programa é fixa ({autopf}\SegurancaIntegral; não use /DIR=):
; o LEIA-ME cita esse caminho.
; Na desinstalação remove programa e tarefa; os dados ficam, salvo se a pessoa
; responder "Sim" à pergunta (padrão "Não").

#if VER < EncodeVer(6,3,0)
  #error É preciso o Inno Setup 6.3 ou mais novo (usa ExecAndCaptureOutput).
#endif

#define AppNome "TETRAGUARD"
#define AppVersao "3.1.0"
#ifndef LAN
  #ifndef TUNNEL
    #define LAN 1
  #endif
#endif
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
#ifdef LAN
OutputBaseFilename=SegurancaIntegral-Setup-LAN
InfoAfterFile=LEIA-ME-LAN.txt
#else
OutputBaseFilename=SegurancaIntegral-Setup
InfoAfterFile=LEIA-ME.txt
#endif
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
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
#ifdef LAN
Source: "lan.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "atualizar-rede.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "LEIA-ME-LAN.txt"; DestDir: "{app}"; Flags: ignoreversion isreadme
#else
Source: "LEIA-ME.txt"; DestDir: "{app}"; Flags: ignoreversion isreadme
#endif
Source: "..\dist\SegurancaIntegral\_internal\*"; DestDir: "{app}\_internal"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\dist\SegurancaIntegral\SegurancaIntegral-cli.exe"; DestDir: "{app}"; Flags: ignoreversion
; por último: o AfterInstall precisa do programa inteiro já copiado
Source: "..\dist\SegurancaIntegral\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion; AfterInstall: ConfigurarDados

[INI]
; atalhos que abrem os portais no navegador padrão (o servidor roda em segundo
; plano, como tarefa agendada, e não tem janela própria)
Filename: "{autodesktop}\TETRAGUARD - Coordenação.url"; Section: "InternetShortcut"; Key: "URL"; String: "http://127.0.0.1:4000"
Filename: "{autodesktop}\TETRAGUARD - Portal do aluno.url"; Section: "InternetShortcut"; Key: "URL"; String: "http://127.0.0.1:3000"
Filename: "{autoprograms}\TETRAGUARD\Coordenação.url"; Section: "InternetShortcut"; Key: "URL"; String: "http://127.0.0.1:4000"
Filename: "{autoprograms}\TETRAGUARD\Portal do aluno.url"; Section: "InternetShortcut"; Key: "URL"; String: "http://127.0.0.1:3000"

[Icons]
; liga a tarefa (pede administrador) e abre a coordenação quando o servidor já subiu
#ifdef LAN
Name: "{autoprograms}\TETRAGUARD\Iniciar servidor"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\atualizar-rede.ps1"" -AbrirCoordenacao"; Comment: "Atualiza a rede, reinicia o servidor e abre a coordenação"
Name: "{autoprograms}\TETRAGUARD\Atualizar rede"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\atualizar-rede.ps1"""; Comment: "Atualiza os endereços após trocar de Wi-Fi e verifica os portais"
#else
Name: "{autoprograms}\TETRAGUARD\Iniciar servidor"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command ""Start-Process -Verb RunAs -WindowStyle Hidden -FilePath schtasks.exe -ArgumentList '/Run','/TN','{#NomeTarefa}'; Start-Sleep -Seconds 6; Start-Process 'http://127.0.0.1:4000'"""; Comment: "Liga o servidor do TETRAGUARD e abre a coordenação"
#endif
#ifdef LAN
Name: "{autoprograms}\TETRAGUARD\Endereços da rede"; Filename: "{app}\Enderecos-da-rede.txt"; Comment: "Endereços para compartilhar com os alunos"

[Run]
Filename: "{app}\Enderecos-da-rede.txt"; Description: "Ver os endereços da rede"; Flags: postinstall shellexec skipifsilent
#endif

[UninstallDelete]
Type: files; Name: "{autodesktop}\TETRAGUARD - Coordenação.url"
Type: files; Name: "{autodesktop}\TETRAGUARD - Portal do aluno.url"
Type: filesandordirs; Name: "{autoprograms}\TETRAGUARD"
#ifdef LAN
Type: files; Name: "{app}\Enderecos-da-rede.txt"
#endif

[Code]
var
  PaginaHosts: TInputQueryWizardPage;

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

end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  { atualização: o config.json existente é mantido, então não pergunta }
#ifdef LAN
  { sem túnel: nada de nomes públicos }
  Result := PageID = PaginaHosts.ID;
#else
  Result := (PageID = PaginaHosts.ID) and FileExists(ArquivoConfig);
#endif
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

{ --- pasta de dados e tarefa -------------------------------------------------- }

procedure ProtegerPasta;
var
  Codigo: Integer;
begin
  if not ForceDirectories(PastaDados) then
    RaiseException('Não foi possível criar ' + PastaDados + '.');
  { /reset /T faz os arquivos que já existem herdarem da pasta; depois só a
    pasta recebe a regra (sem herança do pai; só SYSTEM, S-1-5-18, e
    Administradores, S-1-5-32-544) e ela desce para os filhos. Aplicar
    /inheritance:r com /T direto deixava arquivos antigos com ACL vazia
    (ninguém lia o secret.key). SIDs e não nomes: no Windows em português o
    grupo é "Administradores". }
  Exec(ExpandConstant('{sys}\icacls.exe'), '"' + PastaDados + '" /reset /T',
    '', SW_HIDE, ewWaitUntilTerminated, Codigo);
  if not Exec(ExpandConstant('{sys}\icacls.exe'),
      '"' + PastaDados + '" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F',
      '', SW_HIDE, ewWaitUntilTerminated, Codigo) or (Codigo <> 0) then
    RaiseException('Não foi possível ajustar as permissões de ' + PastaDados +
      ' (icacls, código ' + IntToStr(Codigo) + ').');
end;

#ifndef LAN
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

#else
procedure GravarConfig;
var
  Codigo: Integer;
begin
  { sempre roda (também na atualização): os endereços da rede podem ter mudado }
  if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
      '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\lan.ps1') + '"' +
      ' -DataDir "' + PastaDados + '" -SaidaEnderecos "' + ExpandConstant('{app}\Enderecos-da-rede.txt') + '"',
      '', SW_HIDE, ewWaitUntilTerminated, Codigo) or (Codigo <> 0) then
    RaiseException('Não foi possível configurar a rede local (código ' + IntToStr(Codigo) + ').');
end;

#endif
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
  RegistrarTarefa;
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
#ifdef LAN
var
  Codigo: Integer;
#endif
begin
  { antes de apagar os arquivos: o executável não pode estar rodando }
  if CurUninstallStep = usUninstall then
  begin
    RemoverTarefa;
#ifdef LAN
    Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
      '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\lan.ps1') + '" -Remover',
      '', SW_HIDE, ewWaitUntilTerminated, Codigo);
#endif
  end;

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

