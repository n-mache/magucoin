const fs = require('fs');
const { App } = require('@slack/bolt');
const { error } = require('console');
const https = require('https');
require('dotenv').config();

if (!fs.existsSync("data/")) {
    fs.mkdirSync("data/");
    console.log("data/が存在しないため新たに作成しました。");
}
["data/user_coins.json", "data/user_login.json", "data/user_bypassconfirm.json", "data/user_stocks.json"].forEach(file=>{
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, "{}", 'utf8');
        console.log(file+"が存在しないため新たに作成しました。");
    }
    try{
        var data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (typeof data !== "object") {
            console.error(file+"がobject型ではなく、データが破損している可能性があるためプログラムの開始を中止します。");
            process.exit(1);
        }
    }catch(e){
        console.error(file+"が破損している可能性があるため、プログラムの開始を中止します。");
        process.exit(1);
    }
});

async function sleep(t) {
    return new Promise(res=>setTimeout(res, t));
}

var confirms = {};

function file_read(file) {
    try{
        var data = fs.readFileSync(file, 'utf8');
    }catch(e){
        var data = undefined;
    }finally{
    }
    return data;
}

function file_write(file, data) {
    var success = false;
    try{
        fs.writeFileSync(file, JSON.stringify(data), 'utf8');
        success = true;
    }catch (e){
        console.log(e);
    }finally{
    }
    return success;
}

function change_user_coin(userid, amount) {
    verify_user_data(userid);
    var data = file_read("data/user_coins.json");
    var users = JSON.parse(data);
    users[userid] += Math.floor(Number(amount));
    file_write("data/user_coins.json", users);
    return users[userid];
}

function verify_user_data(userid) {
    var data = file_read("data/user_coins.json");
    var users = JSON.parse(data);
    if (typeof users[userid] === "undefined") {
        users[userid] = 100;
        file_write("data/user_coins.json", users);
    }
    return true;
}

function generate_transid(){
    var chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    var transid = "";
    for (var i = 0; i < 20; i++) {
        transid += chars[Math.floor(Math.random() * chars.length)];
    }
    return transid;
}

const app = new App({
    token: process.env.TOKEN,
    socketMode: true,
    appToken: process.env.APPTOKEN
});

const prefix = "!mg ";
const cmdlist = {
    "help": "ヘルプを表示します。",
    "balance": "所持しているまぐコインを表示します。",
    "send": "指定したユーザーに対して指定した金額のまぐコインを送金します。",
    "ranking": "まぐコインのランキングを表示します。",
    "login": "ログインボーナスを受け取ります。",
    "janken": "3分の1の確率で指定した金額が倍になります。",
    "setconfirmbypass": "コマンド実行時の確認をスキップするように設定します。",
    "stocks": "株価を取得し、株を購入または売却します。"
};
const commands = {};

app.message(/^!mg .*/, async ({ message, say }) => {
    var command = message.text.replace("!mg ", "").split(" ");
    if (typeof commands[command[0]] === "function") {
        await commands[command[0]](message, say, command);
    }else{
        await say({text: "*【エラー】*\n該当するコマンドが見つかりませんでした。\nスペルミスが無いかなどを確認して下さい。\n`!mg help` でコマンド一覧を表示出来ます。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
    }
});

commands["help"] = async function (message, say, command) {
    await app.client.chat.postEphemeral({
        channel: message.channel,
        user: message.user,
        text: "*【まぐコインについて】*\nまぐコインとは、初期状態で全員に100コインずつ配布されているオリジナルの通貨です。\nコマンドを使用して増やしたり、送金したり出来ます。\n\n*【コマンド一覧】*\n"+prefix+"help [command]: helpを表示します\n"+prefix+"balance [@ユーザー名]: 所持しているまぐコインを表示します。\n"+prefix+"send <@ユーザー名> <金額>: 指定したユーザーに対して指定した金額のまぐコインを送金します。\n"+prefix+"ranking: まぐコインのランキングを表示します。\n"+prefix+"login: ログインボーナスを受け取ります。\n"+prefix+"janken <金額>: 3分の1の確率で指定した金額が倍になります。\n"+prefix+"setconfirmbypass <on|off>: 操作実行時の確認メッセージを表示せずに操作を行えるようにします。\n"+prefix+"stocks <buy|sell|list>: 模擬的な株取引が出来ます。\n\n※[]は任意項目\n※<>は必須項目",
        thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts
    });
    await say({"text": "*【ヘルプ】*\n<@"+message.user+">さんにのみ表示されるメッセージで送信しました。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
};
commands["send"] = async function (message, say, command) {
    if (command.length !== 3 || !command[1].match(/<@U.*>/) || (!Number.isInteger(Number(command[2])) || !(Number(command[2]) > 0))) {
        await say({"text": "*【他ユーザーへの送金】*\nコマンドの形式が無効です。\nコマンドは次の形式で実行して下さい: `"+prefix+"send <@ユーザー名> <金額>`", thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
        return;
    }
    var userid = command[1].replace("<@","").replace(">","");
    if (userid === message.user) {
        await say({"text": "*【他ユーザーへの送金】*\n自分に対して送金することは出来ません。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
        return;
    }
    var user = await app.client.users.info({user: userid}).catch((error) => {});
    if (typeof user === "undefined") {
        await say({"text": "*【他ユーザーへの送金】*\n指定されたユーザーが見つかりませんでした。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
        return;
    }
    if (user.user.is_bot) {
        await say({"text": "*【他ユーザーへの送金】*\nボットに対して送金することは出来ません。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
        return;
    }
    verify_user_data(message.user);
    var data = file_read("data/user_coins.json");
    var users = JSON.parse(data);
    if (users[message.user] < command[2]) {
        await say({"text": "*【他ユーザーへの送金】*\n所持しているまぐコインが不足しています。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
        return;
    }
    var bypass = JSON.parse(file_read("data/user_bypassconfirm.json"));
    if (typeof bypass[message.user] !== "undefined" && bypass[message.user]) {
        await action_send(message.thread_ts !== undefined ? message.thread_ts : message.ts, say, {"user": message.user, "to": userid, "amount": command[2]});
    }else{
        var confirm = await say({"text": "*【他ユーザーへの送金】*\n<@"+userid+">に対して `"+command[2]+"コイン` を送金しようとしています。\nこのメッセージに:ok:のリアクションを付けることで操作が確定します。\n※30秒が経過するとこの操作は無効になり、再度コマンド実行が必要になります。\n※この操作は取り消せません。\n※「レターパックで現金送れ」は全て詐欺です。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
        app.client.reactions.add({channel: message.channel,timestamp: confirm.ts,name: 'ok'});
        confirms[confirm.ts] = {"expire": Date.now()+30000, "action": "send", "user": message.user, "to": userid, "amount": command[2]};
    }
};
commands["balance"] = async function (message, say, command) {
    var userid = message.user;
    if (command.length === 2 && command[1].match(/<@U.*>/)) {
        var user = await app.client.users.info({user: command[1].replace("<@","").replace(">","")}).catch((error) => {});
        if (typeof user !== "undefined") {
            userid = command[1].replace("<@","").replace(">","");
        }
        if (user.user.is_bot) {
            await say({"text": "*【所持コインの確認】*\nボットはお金を所持できません。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
            return;
        }
    }
    verify_user_data(userid);
    var data = file_read("data/user_coins.json");
    var users = JSON.parse(data);
    await say({"text": "*【所持コインの確認】*\n<@"+userid+">さんの所持まぐコインは `"+users[message.user]+"コイン` です。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
};
commands["login"] = async function (message, say, command) {
    var logins = JSON.parse(file_read("data/user_login.json"));
    var dayid = Math.floor((Date.now()+7200000)/86400000)
    if (typeof logins[message.user] !== "undefined" && logins[message.user] === dayid) {
        await say({"text": "*【ログイン】*\n今日は既にログインしています。\n午前7時にログインが可能になります。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
        return;
    }
    logins[message.user] = dayid;
    file_write("data/user_login.json", logins);
    change_user_coin(message.user, 100);
    fs.appendFileSync("data/history.csv", Date.now()+","+generate_transid()+",SYSTEM_LOGIN,"+message.user+","+command[2]+"\n");
    await say({"text": "*【ログイン】*\nログインされました。\nログインボーナス: 100コイン", thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
};
commands["ranking"] = async function (message, say, command) {
    var data = file_read("data/user_coins.json");
    var users = JSON.parse(data);
    var ranking = [];
    Object.keys(users).forEach(userid=>{ranking.push([userid, users[userid]]);});
    ranking.sort(function(a,b){return b[1] - a[1];});
    var text = "*【まぐコインランキング】*\n";
    for (let i=0;i<ranking.length;i++) {
        if (i >= 100) break;
        text += (i+1)+"位: <@"+ranking[i][0]+"> `"+ranking[i][1]+"コイン`\n";
    }
    await app.client.chat.postEphemeral({
        channel: message.channel,
        user: message.user,
        text: text,
        thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts
    });
    await say({"text": "*【ランキング】*\n<@"+message.user+">さんにのみ表示されるメッセージで送信しました。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
};
commands["janken"] = async function (message, say, command) {
    if (command.length !== 2 || (!Number.isInteger(Number(command[1])) || !(Number(command[1]) > 0) || !(Number(command[1]) <= 500))) {
        await say({"text": "*【じゃんけん】*\nコマンドの形式が無効です。\nコマンドは次の形式で実行して下さい: `"+prefix+"janken <金額>`\n※金額は最大500コインまでです。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
        return;
    }
    var userid = message.user;
    var data = file_read("data/user_coins.json");
    var users = JSON.parse(data);
    if (users[userid] < command[1]) {
        await say({"text": "*【じゃんけん】*\n所持しているまぐコインが不足しています。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
        return;
    }
    var result = Math.floor(Math.random() * 5);
    var bypass = JSON.parse(file_read("data/user_bypassconfirm.json"));
    if (typeof bypass[userid] !== "undefined" && bypass[userid]) {
        await action_janken(message.thread_ts !== undefined ? message.thread_ts : message.ts, say, {"user": userid, "amount": command[1], "result": result});
    }else{
        var confirm = await say({"text": "*【じゃんけん】*\n`"+command[1]+"コイン` を賭けてじゃんけんをします。\nこのメッセージに:ok:のリアクションを付けることで操作が確定します。\n※30秒が経過するとこの操作は無効になり、再度コマンド実行が必要になります。\n※この操作は取り消せません。\n※「レターパックで現金送れ」は全て詐欺です。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
        app.client.reactions.add({channel: message.channel,timestamp: confirm.ts,name: 'ok'});
        confirms[confirm.ts] = {"expire": Date.now()+30000, "action": "janken", "user": message.user, "amount": command[1], "result": result};
    }
};
commands["setconfirmbypass"] = async function (message, say, command) {
    if (command.length !== 2 || (command[1] !== "on" && command[1] !== "off")) {
        await say({
            "text": "*【コマンド実行確認のスキップ】*\nコマンドの形式が無効です。\nコマンドは次の形式で実行して下さい: `"+prefix+"bypass [on|off]`",
            "thread_ts": message.thread_ts !== undefined ? message.thread_ts : message.ts
        });
        return;
    }
    var skip = command[1] === "on";
    var confirm = await say({
        "text": "*【コマンド実行確認のスキップ】*\nコマンド実行時の確認を"+(skip?"スキップするように":"スキップしないように")+"設定します。\nこのメッセージに:ok:のリアクションを付けることで操作が確定します。\n※30秒が経過するとこの操作は無効になり、再度コマンド実行が必要になります。\n※この操作は取り消せません。",
        "thread_ts": message.thread_ts !== undefined ? message.thread_ts : message.ts
    });
    app.client.reactions.add({channel: message.channel,timestamp: confirm.ts,name: 'ok'});
    confirms[confirm.ts] = {"expire": Date.now()+30000, "action": "setconfirmbypass", "user": message.user, "skip": skip};
}
commands["stocks"] = async function (message, say, command) {
    if (command.length < 2) {
        await say({"text": "*【まぐ株】*\nコマンドの形式が無効です。\nコマンドは次の形式で実行して下さい: `"+prefix+"stocks [buy|sell|list]`", thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
        return;
    }
    var subcommands = ["buy", "sell", "list"];
    var subcommand = command[1];
    if (!subcommands.includes(subcommand)) {
        await say({"text": "*【まぐ株】*\nコマンドの形式が無効です。\nコマンドは次の形式で実行して下さい: `"+prefix+"stocks [buy|sell|list]`", thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
        return;
    }
    if (subcommand === "list") {
        var data = file_read("data/user_stocks.json");
        var stocks = JSON.parse(data)[message.user];
        var text = "*【まぐ株】*\n";
        if (typeof stocks === "undefined" || Object.keys(stocks).length === 0) {
            text += "保有している株がありません。";
        }else{
            text += "保有している株:\n";
            Object.keys(stocks).forEach(code=>{
                var stock = stocks[code];
                text += stock.name+"("+code+"): "+stock.amount+"株\n";
            });
        }
        await say({"text": text, thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
        return;
    }
    if (command.length < 4 || !command[2].match(/[0-9ACDFGHJKLMNPRSTUWXY]{4}/) || !Number.isInteger(Number(command[3])) || !(Number(command[3]) > 0)) {
        await say({"text": "*【まぐ株】*\nコマンドの形式が無効です。\nコマンドは次の形式で実行して下さい: `"+prefix+"stocks "+subcommand+" [証券コード (4桁)] [株数]`\n\n※東京証券取引所の証券コードである必要があります", thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
        return;
    }
    var quote = null;
    try{
        var data = await new Promise((resolve, reject)=>{
            https.get({hostname: "query2.finance.yahoo.com", path: "/v8/finance/chart/"+command[2]+".T", headers: {"User-Agent": "magucoin (https://github.com/n-mache/magucoin)"}}, (res)=>{
                var data = "";
                res.on("data", (chunk)=>{
                    data += chunk;
                });
                res.on("end", ()=>{
                    resolve(data);
                });
                res.on("error", (e)=>{
                    reject(e);
                });
            });
        });
        console.log(data);
        var data = JSON.parse(data);
        if (data.chart.error !== null) {
            var error = "株情報の取得に失敗しました。";
            if (typeof data.chart.error.code !== "undefined" && typeof data.chart.error.description !== "undefined") {
                error = data.chart.error.code+": "+data.chart.error.description;
            }
            await say({"text": "*【まぐ株】*\n"+error, thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
            return;
        }
        quote = data.chart.result[0].meta;
        console.log(quote);
    }catch(e){
        console.log(e);
        await say({"text": "*【まぐ株】*\n通信エラーが発生しました。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
        return;
    }
    if (typeof quote === "undefined") {
        await say({"text": "*【まぐ株】*\n指定された証券コード("+command[2]+")が見つかりませんでした。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
        return;
    }
    var code = command[2];
    var amount = Number(command[3]);
    var stocks = JSON.parse(file_read("data/user_stocks.json"));
    var users = JSON.parse(file_read("data/user_coins.json"));
    if (typeof stocks[message.user] === "undefined") {
        stocks[message.user] = {};
    }
    if (subcommand === "buy") {
        if (typeof stocks[message.user][code] === "undefined") {
            stocks[message.user][code] = {"name": quote.shortName, "amount": 0};
        }
        var price = Math.ceil(quote.regularMarketPrice);
        if (price * amount > users[message.user]) {
            await say({"text": "*【まぐ株】*\n所持しているまぐコインが不足しています。\n必要まぐコイン: `"+(price * amount)+"` コイン", thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
            return;
        }
        var confirm = await say({
            "text": "*【まぐ株】*\n"+quote.shortName+"("+code+")を `"+amount+"` 株購入しようとしています。\n必要なまぐコインは `"+(price * amount)+"` コインです。\nこのメッセージに:ok:のリアクションを付けることで操作が確定します。\n※30秒が経過するとこの操作は無効になり、再度コマンド実行が必要になります。\n※この操作は取り消せません。",
            "thread_ts": message.thread_ts !== undefined ? message.thread_ts : message.ts
        });
        app.client.reactions.add({channel: message.channel,timestamp: confirm.ts,name: 'ok'});
        confirms[confirm.ts] = {"expire": Date.now()+30000, "action": "stocks", "user": message.user, "type": "buy", "quote": quote, "code": code, "amount": amount, "stocks": stocks};
    }
    if (subcommand === "sell") {
        if (typeof stocks[message.user][code] === "undefined" || stocks[message.user][code].amount < amount) {
            await say({"text": "*【まぐ株】*\n所持している株が不足しています。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : message.ts});
            return;
        }
        var price = Math.floor(quote.regularMarketPrice);
        var confirm = await say({
            "text": "*【まぐ株】*\n"+quote.shortName+"("+code+")を `"+amount+"` 株売却しようとしています。\n売却時のまぐコインは `"+(price * amount)+"` コインです。\nこのメッセージに:ok:のリアクションを付けることで操作が確定します。\n※30秒が経過するとこの操作は無効になり、再度コマンド実行が必要になります。\n※この操作は取り消せません。",
            "thread_ts": message.thread_ts !== undefined ? message.thread_ts : message.ts
        });
        app.client.reactions.add({channel: message.channel,timestamp: confirm.ts,name: 'ok'});
        confirms[confirm.ts] = {"expire": Date.now()+30000, "action": "stocks", "user": message.user, "type": "sell", "quote": quote, "code": code, "amount": amount, "stocks": stocks};
    }
    return;
};
app.event('reaction_added', async ({ event, say }) => {
    if (typeof confirms[event.item.ts] === "undefined" || confirms[event.item.ts].expire < Date.now()) return;
    if (event.reaction === "ok" && event.user === confirms[event.item.ts].user) {
        var data = confirms[event.item.ts];
        delete confirms[event.item.ts];
        app.client.reactions.remove({channel: event.item.channel,timestamp: event.item.ts,name: 'ok'});
        var thread_ts = event.item.thread_ts !== undefined ? event.item.thread_ts : event.item.ts;
        if (data.action === "send") {
            await action_send(thread_ts, say, data);
        }
        if (data.action === "janken") {
            await action_janken(thread_ts, say, data);
        }
        if (data.action === "stocks") {
            await action_stocks(thread_ts, say, data);
        }
        if (data.action === "setconfirmbypass") {
            var bypass = JSON.parse(file_read("data/user_bypassconfirm.json"));
            if (data.skip){
                bypass[data.user] = true;
            }else{
                delete bypass[data.user];
            }
            file_write("data/user_bypassconfirm.json", bypass);
            await say({"text": "*【コマンド実行確認のスキップ】*\nコマンド実行確認のスキップ設定を変更しました。\n\n*設定内容*\n確認メッセージをスキップする: "+(data.skip?"はい":"いいえ"), thread_ts: event.item.thread_ts !== undefined ? event.item.thread_ts : event.item.ts});
        }
    }
    delete confirms[event.item.ts];
});
async function action_send(thread_ts, say, data) {
    verify_user_data(data.user);
    var coins = JSON.parse(file_read("data/user_coins.json"));
    if (coins[data.user] < data.amount) {
        await say({"text": "*【他ユーザーへの送金】*\n所持しているまぐコインが不足しています。", thread_ts: thread_ts});
        return;
    }
    var nowcoin = change_user_coin(data.user, -data.amount);
    change_user_coin(data.to, data.amount);
    fs.appendFileSync("data/history.csv", Date.now()+","+generate_transid()+","+data.user+","+data.to+","+data.amount+"\n");
    await say({text: "*【他ユーザーへの送金】*\n<@"+data.user+">さんが<@"+data.to+">さんに `"+data.amount+"` コインを送金しました。\n現在のあなたの所持まぐコインは `"+nowcoin+"` コインです。", thread_ts: thread_ts});
    return true;
}
async function action_janken(thread_ts, say, data) {
    verify_user_data(data.user);
    var coins = JSON.parse(file_read("data/user_coins.json"));
    if (coins[data.user] < data.amount) {
        await say({"text": "*【じゃんけん】*\n所持しているまぐコインが不足しています。", thread_ts: thread_ts});
        return;
    }
    var result = data.result;
    var nowcoin = coins[data.user];
    if ([0,1].includes(result)){
        nowcoin = change_user_coin(data.user, -data.amount);
        fs.appendFileSync("data/history.csv", Date.now()+","+generate_transid()+","+data.user+",SYSTEM_JANKEN,"+data.amount+"\n");
        await say({"text": "*【じゃんけん】*\n<@"+data.user+">さんはじゃんけんに負けて `"+data.amount+"` コインを失いました。\n現在のあなたの所持まぐコインは `"+nowcoin+"` コインです。", thread_ts: thread_ts});
    }
    if ([2,3].includes(result)){
        nowcoin = change_user_coin(data.user, data.amount);
        fs.appendFileSync("data/history.csv", Date.now()+","+generate_transid()+",SYSTEM_JANKEN,"+data.user+","+data.amount+"\n");
        await say({"text": "*【じゃんけん】*\n<@"+data.user+">さんはじゃんけんに勝って  `"+data.amount+"` コインを獲得しました。\n現在のあなたの所持まぐコインは `"+nowcoin+"` コインです。", thread_ts: thread_ts});
    }
    if ([4].includes(result)){
        await say({"text": "*【じゃんけん】*\n<@"+data.user+">さんはじゃんけんで引き分けでした。\n現在のあなたの所持まぐコインは `"+nowcoin+"` コインです。", thread_ts: thread_ts});
    }
}
async function action_stocks(thread_ts, say, data) {
    var quote = data.quote;
    var users = JSON.parse(file_read("data/user_coins.json"));
    if (typeof data.stocks[data.user] === "undefined") {
        data.stocks[data.user] = {};
    }
    if (data.type === "buy"){
        if (typeof data.stocks[data.user][data.code] === "undefined") {
            data.stocks[data.user][data.code] = {"name": quote.shortName, "amount": 0};
        }
        var price = Math.ceil(quote.regularMarketPrice);
        if (price * data.amount > users[data.user]) {
            await say({"text": "*【まぐ株】*\n所持しているまぐコインが不足しています。\n必要まぐコイン: `"+price+"` コイン", thread_ts: thread_ts});
            return;
        }
        data.stocks[data.user][data.code].amount += data.amount;
        var nowcoin = change_user_coin(data.user, -price * data.amount);
        fs.appendFileSync("data/history.csv", Date.now()+","+generate_transid()+","+data.user+",SYSTEM_STOCKS,"+price * data.amount+"\n");
        await say({"text": "*【まぐ株】*\n"+quote.shortName+"("+data.code+")を `"+data.amount+"` 株購入しました。\n現在のあなたの所持まぐコインは `"+nowcoin+"` コインです。", thread_ts: thread_ts});
    }
    if (data.type === "sell"){
        if (typeof data.stocks[data.user][data.code] === "undefined" || data.stocks[data.user][data.code].amount < data.amount) {
            await say({"text": "*【まぐ株】*\n所持している株が不足しています。", thread_ts: thread_ts});
            return;
        }
        var price = Math.floor(quote.regularMarketPrice);
        data.stocks[data.user][data.code].amount -= data.amount;
        if (data.stocks[data.user][data.code].amount === 0) {
            delete data.stocks[data.user][data.code];
        }
        var nowcoin = change_user_coin(data.user, price * data.amount);
        fs.appendFileSync("data/history.csv", Date.now()+","+generate_transid()+",SYSTEM_STOCKS,"+data.user+","+price * data.amount+"\n");
        await say({"text": "*【まぐ株】*\n"+quote.shortName+"("+data.code+")を `"+data.amount+"` 株売却しました。\n現在のあなたの所持まぐコインは `"+nowcoin+"` コインです。", thread_ts: thread_ts});
    }
    file_write("data/user_stocks.json", data.stocks);
}
setInterval(function(){
    Object.keys(confirms).forEach(ts=>{
        if (confirms[ts].expire < Date.now()) {
            delete confirms[ts];
        }
    });
}, 1000);

(async () => {
    await app.start();
    console.log('⚡️ Bolt app is running!');
})();
