## まぐコインって何？
Slackで動くオリジナル通貨のBotです。<br>
マグネットのまぐとコインを合わせてまぐコインです。
## 動かし方
### 必要な設定について
#### Socket Mode
「Socket Mode」を有効化して下さい。
#### Event Subscriptions
「Event Subscriptions」を有効化し、「Subscribe to bot events」にて<br>
・message.channels<br>
・message.groups<br>
・reaction_added<br>
の2つを有効化して下さい。
#### Bot Token Scopes
以下の項目を追加して下さい。<br>
・channels:history<br>
・groups:history<br>
・chat:write<br>
・reactions:read<br>
・reactions:write<br>
・users:read
#### envファイル
.envファイルを作成し、以下の内容を記載して下さい。
```
TOKEN=<「xoxb」から始まるワークスペースにインストールしたときに貰ったトークン>
APPTOKEN=<「xapp」から始まるSocket modeを有効化するときに作ったトークン>
```
### 実行する
#### 実行の準備
```
git clone https://github.com/n-mache/magucoin
cd magucoin
npm i
```
#### 実行コマンド
```
npm start
```
