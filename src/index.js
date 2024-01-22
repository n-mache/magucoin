const fs = require('fs');
const cron = require('node-cron');
const { App } = require('@slack/bolt');
require('dotenv').config();

if (!fs.existsSync("data/")) {
    fs.mkdirSync("data/");
    console.log("data/が存在しないため新たに作成しました。");
}
if (!fs.existsSync("data/user_coins.json")) {
    fs.writeFileSync("data/user_coins.json", "{}", 'utf8');
    console.log("data/user_coins.jsonが存在しないため新たに作成しました。");
}
try{
    JSON.parse(fs.readFileSync("data/user_coins.json", 'utf8'));
}catch(e){
    throw new Error("data/user_coins.jsonが破損している可能性があるため、プログラムの開始を中止しました。");
}

var logins = [];

cron.schedule('0 0 7 * * *', () => {
    console.log("ログインの情報をリセットしました。");
    logins = [];
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
    users[userid] += Number(amount);
    file_write("data/user_coins.json", users);
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
    "janken": "3分の1の確率で指定した金額が倍になります。"
};
const commands = {};

app.message(/!mg .*/, async ({ message, say }) => {
    var command = message.text.replace("!mg ", "").split(" ");
    if (typeof commands[command[0]] === "function") {
        await commands[command[0]](message, say, command);
    }else{
        await say({text: "*【エラー】*\n該当するコマンドが見つかりませんでした。\nスペルミスが無いかなどを確認して下さい。\n`!mg help` でコマンド一覧を表示出来ます。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : undefined});
    }
});

commands["help"] = async function (message, say, command) {
    await app.client.chat.postEphemeral({
        channel: message.channel,
        user: message.user,
        text: "*【まぐコインについて】*\nまぐコインとは、初期状態で全員に100コインずつ配布されているオリジナルの通貨です。\nコマンドを使用して増やしたり、送金したり出来ます。\n\n*【コマンド一覧】*\n"+prefix+"help [command]: helpを表示します\n"+prefix+"balance [@ユーザー名]: 所持しているまぐコインを表示します。\n"+prefix+"send <@ユーザー名> <金額>: 指定したユーザーに対して指定した金額のまぐコインを送金します。\n"+prefix+"ranking: まぐコインのランキングを表示します。\n"+prefix+"login: ログインボーナスを受け取ります。\n"+prefix+"janken <金額>: 3分の1の確率で指定した金額が倍になります。\n\n※[]は任意項目\n※<>は必須項目"
    });
    await say({"text": "*【ヘルプ】*\n<@"+message.user+">さんにのみ表示されるメッセージで送信しました。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : undefined});
};
commands["send"] = async function (message, say, command) {
    if (command.length !== 3 || !command[1].match(/<@U.*>/) || (!Number.isInteger(Number(command[2])) || !(Number(command[2]) > 0))) {
        await say({"text": "*【他ユーザーへの送金】*\nコマンドの形式が無効です。\nコマンドは次の形式で実行して下さい: `"+prefix+"send <@ユーザー名> <金額>`", thread_ts: message.thread_ts !== undefined ? message.thread_ts : undefined});
        return;
    }
    var userid = command[1].replace("<@","").replace(">","");
    if (userid === message.user) {
        await say({"text": "*【他ユーザーへの送金】*\n自分に対して送金することは出来ません。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : undefined});
        return;
    }
    var user = await app.client.users.info({user: userid}).catch((error) => {});
    if (typeof user === "undefined") {
        await say({"text": "*【他ユーザーへの送金】*\n指定されたユーザーが見つかりませんでした。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : undefined});
        return;
    }
    if (user.user.is_bot) {
        await say({"text": "*【他ユーザーへの送金】*\nボットに対して送金することは出来ません。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : undefined});
        return;
    }
    verify_user_data(message.user);
    var data = file_read("data/user_coins.json");
    var users = JSON.parse(data);
    if (users[message.user] < command[2]) {
        await say({"text": "*【他ユーザーへの送金】*\n所持しているまぐコインが不足しています。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : undefined});
        return;
    }
    var confirm = await say({"text": "*【他ユーザーへの送金】*\n<@"+userid+">に対して `"+command[2]+"コイン` を送金しようとしています。\nこのメッセージに:ok:のリアクションを付けることで操作が確定します。\n※30秒が経過するとこの操作は無効になり、再度コマンド実行が必要になります。\n※この操作は取り消せません。\n※「レターパックで現金送れ」は全て詐欺です。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : undefined});
    app.client.reactions.add({channel: message.channel,timestamp: confirm.ts,name: 'ok'});
    confirms[confirm.ts] = {"expire": Date.now()+30000, "action": "send", "user": message.user, "to": userid, "amount": command[2]};
};
commands["balance"] = async function (message, say, command) {
    var userid = message.user;
    if (command.length === 2 && command[1].match(/<@U.*>/)) {
        var user = await app.client.users.info({user: command[1].replace("<@","").replace(">","")}).catch((error) => {});
        if (typeof user !== "undefined") {
            userid = command[1].replace("<@","").replace(">","");
        }
        if (user.user.is_bot) {
            await say({"text": "*【所持コインの確認】*\nボットはお金を所持できません。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : undefined});
            return;
        }
    }
    verify_user_data(userid);
    var data = file_read("data/user_coins.json");
    var users = JSON.parse(data);
    await say({"text": "*【所持コインの確認】*\n<@"+userid+">さんの所持まぐコインは `"+users[message.user]+"コイン` です。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : undefined});
};
commands["login"] = async function (message, say, command) {
    if (logins.includes(message.user)) {
        await say({"text": "*【ログイン】*\n今日は既にログインしています。\n午前7時にログインが可能になります。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : undefined});
        return;
    }
    logins.push(message.user);
    change_user_coin(message.user, 100);
    fs.appendFileSync("data/history.csv", Date.now()+","+generate_transid()+",SYSTEM_LOGIN,"+message.user+","+command[2]+"\n");
    await say({"text": "*【ログイン】*\nログインされました。\nログインボーナス: 100コイン", thread_ts: message.thread_ts !== undefined ? message.thread_ts : undefined});
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
        text: text
    });
    await say("*【ランキング】*\n<@"+message.user+">さんにのみ表示されるメッセージで送信しました。");
};
commands["janken"] = async function (message, say, command) {
    if (command.length !== 2 || (!Number.isInteger(Number(command[1])) || !(Number(command[1]) > 0) || !(Number(command[1]) <= 500))) {
        await say({"text": "*【じゃんけん】*\nコマンドの形式が無効です。\nコマンドは次の形式で実行して下さい: `"+prefix+"janken <金額>`\n※金額は最大500コインまでです。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : undefined});
        return;
    }
    var userid = message.user;
    var data = file_read("data/user_coins.json");
    var users = JSON.parse(data);
    if (users[userid] < command[1]) {
        await say({"text": "*【じゃんけん】*\n所持しているまぐコインが不足しています。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : undefined});
        return;
    }
    var confirm = await say({"text": "*【じゃんけん】*\n`"+command[1]+"コイン` を賭けてじゃんけんをします。\nこのメッセージに:ok:のリアクションを付けることで操作が確定します。\n※30秒が経過するとこの操作は無効になり、再度コマンド実行が必要になります。\n※この操作は取り消せません。\n※「レターパックで現金送れ」は全て詐欺です。", thread_ts: message.thread_ts !== undefined ? message.thread_ts : undefined});
    app.client.reactions.add({channel: message.channel,timestamp: confirm.ts,name: 'ok'});
    confirms[confirm.ts] = {"expire": Date.now()+30000, "action": "janken", "user": message.user, "amount": command[1]};
};
app.event('reaction_added', async ({ event, say }) => {
    if (typeof confirms[event.item.ts] === "undefined" || confirms[event.item.ts].expire < Date.now()) return;
    if (event.reaction === "ok" && event.user === confirms[event.item.ts].user) {
        var data = confirms[event.item.ts];
        delete confirms[event.item.ts];
        if (data.action === "send") {
            verify_user_data(data.user);
            var coins = file_read("data/user_coins.json");
            if (coins[data.user] < data.amount) {
                await say({"text": "*【他ユーザーへの送金】*\n所持しているまぐコインが不足しています。", thread_ts: event.item.thread_ts !== undefined ? event.item.thread_ts : event.item.ts});
                return;
            }
            change_user_coin(data.user, -data.amount);
            change_user_coin(data.to, data.amount);
            fs.appendFileSync("data/history.csv", Date.now()+","+generate_transid()+","+data.user+","+data.to+","+data.amount+"\n");
            await say({text: "*【他ユーザーへの送金】*\n<@"+data.user+">さんが<@"+data.to+">さんに"+data.amount+"コインを送金しました。", thread_ts: event.item.thread_ts !== undefined ? event.item.thread_ts : event.item.ts});
        }
        if (data.action === "janken") {
            verify_user_data(data.user);
            var coins = file_read("data/user_coins.json");
            if (coins[data.user] < data.amount) {
                await say({"text": "*【じゃんけん】*\n所持しているまぐコインが不足しています。", thread_ts: event.item.thread_ts !== undefined ? event.item.thread_ts : event.item.ts});
                return;
            }
            var result = Math.floor(Math.random() * 3);
            if (result == 0){
                change_user_coin(data.user, -data.amount);
                fs.appendFileSync("data/history.csv", Date.now()+","+generate_transid()+","+data.user+",SYSTEM_JANKEN,"+data.amount+"\n");
                await say({"text": "*【じゃんけん】*\n<@"+data.user+">さんはじゃんけんに負けて"+data.amount+"コインを失いました。", thread_ts: event.item.thread_ts !== undefined ? event.item.thread_ts : event.item.ts});
            }
            if (result == 1){
                await say({"text": "*【じゃんけん】*\n<@"+data.user+">さんはじゃんけんで引き分けでした。", thread_ts: event.item.thread_ts !== undefined ? event.item.thread_ts : event.item.ts});
            }
            if (result == 2){
                change_user_coin(data.user, data.amount);
                fs.appendFileSync("data/history.csv", Date.now()+","+generate_transid()+",SYSTEM_JANKEN,"+data.user+","+data.amount+"\n");
                await say({"text": "*【じゃんけん】*\n<@"+data.user+">さんはじゃんけんに勝って"+data.amount+"コインを獲得しました。", thread_ts: event.item.thread_ts !== undefined ? event.item.thread_ts : event.item.ts});
            }
        }
    }
    delete confirms[event.item.ts];
});
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
