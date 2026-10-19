// UNITED web bridge v1. ASCII source is intentional: senior.pwn is CP1251.
// Dedicated non-reconnecting R39-6 connection; one bounded job per 10 seconds.
// All SQL identifiers are fixed here. Never execute SQL supplied by the website.
#if defined _united_web_bridge
    #endinput
#endif
#define _united_web_bridge

new UUW_DB, UUW_Timer, bool:UUW_Paused, UUW_Id[49], UUW_Instance[49];
new UUW_SQL[14000];
new const UUW_Tables[5][] = {"accounts_1101", "houses", "business", "ownable_cars", "appartaments_ap"};
new const UUW_Entities[5][] = {"players", "houses", "businesses", "vehicles", "apartments"};
// Must match lib/admin/catalog.js columns. Snapshot checks are case-sensitive.
new const UUW_Columns[5][] = {
    "id,name,skin,level,exp,admin,money,bank,donate_current,coins,phone,phone_balance,team,job,premium,premium_time,last_login,last_exit,reg_time,warn",
    "id,owner_id,name,city,zone,price,rent_price,rent_time,type,improvements,x,y,z,lock",
    "id,owner_id,name,city,zone,price,rent_price,rent_time,type,balance,products,prod_price,enter_price,improvements,x,y,z,lock",
    "id,owner_id,model_id,number,region,mileage,fuel,health,color_1,color_2,create_time,famcar,status,pos_x,pos_y,pos_z",
    "id,owner_id,app_id,floor,apt_num,price,rent_price,type,paid_days,locked,upgrade_level,x,y,z"
};

stock UUW_Stop()
{
    UUW_Paused = true;
    if(UUW_DB) mysql_query(UUW_DB, "ROLLBACK", false);
    // Do not reconnect/retry uncertain commits with potentially stale memory.
    print("[UNITED-WEB] Paused after SQL failure. Inspect DB and restart gamemode; no automatic retry.");
    return 0;
}
stock bool:UUW_Exec(query[])
{
    mysql_query(UUW_DB, query, false);
    if(mysql_errno(UUW_DB)) { UUW_Stop(); return false; }
    return true;
}
stock bool:UUW_Engine(const table[])
{
    new query[240];
    mysql_format(UUW_DB, query, sizeof query, "SELECT ENGINE='InnoDB' ok FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='%e'", table);
    new Cache:result = mysql_query(UUW_DB, query, true);
    if(mysql_errno(UUW_DB)) { UUW_Stop(); return false; }
    new bool:ok = cache_get_row_count(UUW_DB) == 1 && cache_get_field_content_int(0,"ok",UUW_DB) == 1;
    cache_delete(result,UUW_DB); return ok;
}
stock UUW_Where(kind)
{
    new key[32], piece[350], offset, cursor;
    while(UUW_Columns[kind][offset])
    {
        cursor=0;
        while(UUW_Columns[kind][offset] && UUW_Columns[kind][offset]!=',') key[cursor++]=UUW_Columns[kind][offset++];
        key[cursor]=EOS; if(UUW_Columns[kind][offset]==',') offset++;
        format(piece,sizeof piece," AND JSON_CONTAINS_PATH(@uu_expected,'one','$.%s') AND (BINARY CAST(`%s` AS CHAR CHARACTER SET utf8mb4) <=> BINARY CASE WHEN JSON_TYPE(JSON_EXTRACT(@uu_expected,'$.%s'))='NULL' THEN NULL ELSE JSON_UNQUOTE(JSON_EXTRACT(@uu_expected,'$.%s')) END)",key,key,key,key);
        strcat(UUW_SQL,piece,sizeof UUW_SQL);
    }
    return 1;
}
stock UUW_Select(kind,recordid)
{
    new key[32],piece[100],offset,cursor;
    format(UUW_SQL,sizeof UUW_SQL,"SELECT ");
    while(UUW_Columns[kind][offset])
    {
        cursor=0;
        while(UUW_Columns[kind][offset]&&UUW_Columns[kind][offset]!=',')key[cursor++]=UUW_Columns[kind][offset++];
        key[cursor]=EOS;
        format(piece,sizeof piece,"`%s`",key);strcat(UUW_SQL,piece,sizeof UUW_SQL);
        if(UUW_Columns[kind][offset]==',') {offset++;strcat(UUW_SQL,",",sizeof UUW_SQL);}
    }
    format(piece,sizeof piece," FROM `%s` WHERE id=%d",UUW_Tables[kind],recordid);strcat(UUW_SQL,piece,sizeof UUW_SQL);
    return 1;
}
stock UUW_Init()
{
    // OFF by default. Do not rely on unknown custom server.cfg console vars.
    if(!fexist("united_web_bridge.cfg")) return print("[UNITED-WEB] Disabled (no scriptfiles/united_web_bridge.cfg).");
    new File:config=fopen("united_web_bridge.cfg",io_read),line[128],enabled;
    if(!config)return print("[UNITED-WEB] Cannot read config; disabled.");
    while(fread(config,line,sizeof line,false))
    {
        new n=strlen(line);
        while(n>0&&(line[n-1]=='\r'||line[n-1]=='\n'))line[--n]=EOS;
        if(!strfind(line,"enabled=",false))enabled=!strcmp(line,"enabled=1");
        if(!strfind(line,"bridge_id=",false))strmid(UUW_Id,line,10,strlen(line),sizeof UUW_Id);
    }
    fclose(config);
    if(!enabled)return print("[UNITED-WEB] Disabled by local config.");
    new length=strlen(UUW_Id);
    if(length<1 || length>48) return print("[UNITED-WEB] Invalid bridge ID.");
    for(new i;i<length;i++) if(!((UUW_Id[i]>='a'&&UUW_Id[i]<='z')||(UUW_Id[i]>='0'&&UUW_Id[i]<='9')||UUW_Id[i]=='_'||UUW_Id[i]=='-')) return print("[UNITED-WEB] Invalid bridge ID.");
    format(UUW_Instance,sizeof UUW_Instance,"%d-%d-%d",gettime(),GetTickCount(),random(2147483647));
    // R39-6 otherwise deduplicates identical credentials and may return mysql.
    // No other mysql_option call exists in this gamemode; restore default false.
    mysql_option(DUPLICATE_CONNECTIONS,true);
    UUW_DB=mysql_connect(ServersData[SERVERID][E_MYSQL_HOST],ServersData[SERVERID][E_MYSQL_USER],ServersData[SERVERID][E_MYSQL_DB],ServersData[SERVERID][E_MYSQL_PASSWORD],3306,false,1);
    mysql_option(DUPLICATE_CONNECTIONS,false);
    if(UUW_DB==mysql) { UUW_DB=0;return print("[UNITED-WEB] Dedicated connection unavailable; disabled."); }
    if(!UUW_DB || mysql_errno(UUW_DB)) return UUW_Stop();
    mysql_set_charset("cp1251",UUW_DB);
    if(mysql_errno(UUW_DB)) return UUW_Stop();
    // Unsupported storage engines fail closed; never convert them implicitly.
    if(!UUW_Engine("site_admin_changes")||!UUW_Engine("site_admin_audit")||!UUW_Engine("site_admin_dispatch")||!UUW_Engine("site_admin_bridge")||!UUW_Engine("accounts_1101")) return UUW_Stop();
    if(!UUW_Exec("SET SESSION innodb_lock_wait_timeout=1")) return 0;
    // Hold one database-wide ownership lock for this connection's lifetime.
    // A second gamemode must not consume jobs with a different/stale cache.
    new Cache:ownership=mysql_query(UUW_DB,"SELECT GET_LOCK(CONCAT('uu-web-',LEFT(SHA2(DATABASE(),256),32)),0) ok",true);
    if(mysql_errno(UUW_DB))return UUW_Stop();
    new owned=cache_get_field_content_int(0,"ok",UUW_DB);cache_delete(ownership,UUW_DB);
    if(owned!=1) {mysql_close(UUW_DB);UUW_DB=0;return print("[UNITED-WEB] Another instance owns this database; disabled.");}
    UUW_Timer=SetTimer("UUW_Poll",10000,true);
    print("[UNITED-WEB] Started; awaiting explicit website dispatches, protocol 1.");
    return 1;
}
forward UUW_Poll();
public UUW_Poll()
{
    if(UUW_Paused||!UUW_DB) return 0;
    // Do not race existing threaded game writes or startup loading callbacks.
    if(mysql_unprocessed_queries(mysql)>0) return 1;
    return UUW_Tick();
}
stock UUW_Tick()
{
    new engines[5],caps[150];
    for(new k;k<5;k++) engines[k]=UUW_Engine(UUW_Tables[k]);
    if(UUW_Paused) return 0;
    format(caps,sizeof caps,"{\"players\":%d,\"houses\":%d,\"businesses\":%d,\"vehicles\":%d,\"apartments\":%d}",engines[0],engines[1],engines[2],engines[3],engines[4]);
    mysql_format(UUW_DB,UUW_SQL,sizeof UUW_SQL,"INSERT INTO site_admin_bridge(bridge_id,instance_id,protocol,enabled,capabilities,heartbeat_at,detail_code) VALUES('%e','%e',1,1,'%e',UTC_TIMESTAMP(),'ready') ON DUPLICATE KEY UPDATE instance_id=VALUES(instance_id),protocol=1,enabled=1,capabilities=VALUES(capabilities),heartbeat_at=UTC_TIMESTAMP(),detail_code='ready'",UUW_Id,UUW_Instance,caps);
    if(!UUW_Exec(UUW_SQL)||!UUW_Exec("START TRANSACTION")) return 0;
    mysql_format(UUW_DB,UUW_SQL,sizeof UUW_SQL,"SELECT c.id,c.entity,c.record_id,d.dispatched_by,IFNULL(a.admin,0) actor_admin,d.expires_at<=UTC_TIMESTAMP() expired,JSON_LENGTH(c.changes) n,JSON_UNQUOTE(JSON_EXTRACT(c.changes,'$.name.after')) new_name,JSON_EXTRACT(c.changes,'$.skin.after') skin,JSON_EXTRACT(c.changes,'$.color_1.after') c1,JSON_EXTRACT(c.changes,'$.color_2.after') c2,JSON_EXTRACT(c.changes,'$.locked.after') locked,JSON_CONTAINS_PATH(c.changes,'one','$.color_1') has_c1,JSON_CONTAINS_PATH(c.changes,'one','$.color_2') has_c2 FROM site_admin_changes c JOIN site_admin_dispatch d ON d.change_id=c.id LEFT JOIN accounts_1101 a ON a.id=d.dispatched_by WHERE c.status='queued' AND d.bridge_id='%e' ORDER BY d.created_at,c.id LIMIT 1 FOR UPDATE",UUW_Id);
    new Cache:result=mysql_query(UUW_DB,UUW_SQL,true);
    if(mysql_errno(UUW_DB)) return UUW_Stop();
    if(!cache_get_row_count(UUW_DB)) { cache_delete(result,UUW_DB);return UUW_Exec("COMMIT"); }
    new id[37],entity[24],after[64],actor,recordid,kind=-1,code[40]="applied",count,skin,c1,c2,locked,has1,has2;
    cache_get_field_content(0,"id",id,UUW_DB,sizeof id);
    cache_get_field_content(0,"entity",entity,UUW_DB,sizeof entity);
    cache_get_field_content(0,"new_name",after,UUW_DB,sizeof after);
    actor=cache_get_field_content_int(0,"dispatched_by",UUW_DB);
    recordid=cache_get_field_content_int(0,"record_id",UUW_DB);
    count=cache_get_field_content_int(0,"n",UUW_DB);
    skin=cache_get_field_content_int(0,"skin",UUW_DB);
    c1=cache_get_field_content_int(0,"c1",UUW_DB); c2=cache_get_field_content_int(0,"c2",UUW_DB);
    locked=cache_get_field_content_int(0,"locked",UUW_DB);
    has1=cache_get_field_content_int(0,"has_c1",UUW_DB);has2=cache_get_field_content_int(0,"has_c2",UUW_DB);
    if(cache_get_field_content_int(0,"actor_admin",UUW_DB)!=12) code="actor_revoked";
    if(cache_get_field_content_int(0,"expired",UUW_DB)) code="expired";
    cache_delete(result,UUW_DB);
    for(new k;k<5;k++) if(!strcmp(entity,UUW_Entities[k])) kind=k;
    if(kind<0||recordid<1) return UUW_Finish(id,actor,"invalid_target");
    if(!engines[kind]) code="engine_blocked";
    if(strcmp(code,"applied")) return UUW_Finish(id,actor,code);
    // Session variables stay on the dedicated non-reconnecting sync connection.
    mysql_format(UUW_DB,UUW_SQL,sizeof UUW_SQL,"SET @uu_expected=(SELECT snapshot FROM site_admin_dispatch WHERE change_id='%e'),@uu_changes=(SELECT changes FROM site_admin_changes WHERE id='%e')",id,id);
    if(!UUW_Exec(UUW_SQL)) return 0;
    switch(kind)
    {
        case 0:format(UUW_SQL,sizeof UUW_SQL,"SELECT JSON_LENGTH(@uu_changes)=1 AND JSON_TYPE(JSON_EXTRACT(@uu_changes,'$.skin.after'))='INTEGER' ok");
        case 1,2:format(UUW_SQL,sizeof UUW_SQL,"SELECT JSON_LENGTH(@uu_changes)=1 AND JSON_TYPE(JSON_EXTRACT(@uu_changes,'$.name.after'))='STRING' ok");
        case 3:format(UUW_SQL,sizeof UUW_SQL,"SELECT JSON_LENGTH(@uu_changes)=JSON_CONTAINS_PATH(@uu_changes,'one','$.color_1')+JSON_CONTAINS_PATH(@uu_changes,'one','$.color_2') AND (NOT JSON_CONTAINS_PATH(@uu_changes,'one','$.color_1') OR JSON_TYPE(JSON_EXTRACT(@uu_changes,'$.color_1.after'))='INTEGER') AND (NOT JSON_CONTAINS_PATH(@uu_changes,'one','$.color_2') OR JSON_TYPE(JSON_EXTRACT(@uu_changes,'$.color_2.after'))='INTEGER') ok");
        case 4:format(UUW_SQL,sizeof UUW_SQL,"SELECT JSON_LENGTH(@uu_changes)=1 AND JSON_TYPE(JSON_EXTRACT(@uu_changes,'$.locked.after'))='INTEGER' ok");
    }
    result=mysql_query(UUW_DB,UUW_SQL,true);
    if(mysql_errno(UUW_DB))return UUW_Stop();
    new payloadValid=cache_get_field_content_int(0,"ok",UUW_DB);cache_delete(result,UUW_DB);
    if(!payloadValid)return UUW_Finish(id,actor,"invalid_payload");
    // Only allowlisted game fields, not SELECT * / credentials.
    UUW_Select(kind,recordid);
    UUW_Where(kind);strcat(UUW_SQL," FOR UPDATE",sizeof UUW_SQL);
    result=mysql_query(UUW_DB,UUW_SQL,true);
    if(mysql_errno(UUW_DB)) return UUW_Stop();
    if(cache_get_row_count(UUW_DB)!=1) {cache_delete(result,UUW_DB);return UUW_Finish(id,actor,"stale_record");}
    new index=-1,before[64],old1,old2;
    switch(kind)
    {
        case 0:
        {
            cache_get_field_content(0,"name",before,UUW_DB,sizeof before);
            // Includes connecting/unauthorized players, not only logged-in IDs.
            new nickname[MAX_PLAYER_NAME];
            for(new p;p<MAX_PLAYERS;p++) if(IsPlayerConnected(p)) {GetPlayerName(p,nickname,sizeof nickname);if(!strcmp(nickname,before,true)||GetPlayerAccountID(p)==recordid) code="player_online";}
            if(count!=1||!IsValidSkin(skin)) code="invalid_skin";
        }
        case 1:
        {
            cache_get_field_content(0,"name",before,UUW_DB,sizeof before);
            for(new i;i<g_house_loaded;i++) if(GetHouseData(i,H_SQL_ID)==recordid) {index=i;break;}
            if(index<0||strcmp(g_house[index][H_NAME],before)) code="cache_mismatch";
            if(count!=1||strlen(after)<1||strlen(after)>19) code="invalid_name";
        }
        case 2:
        {
            cache_get_field_content(0,"name",before,UUW_DB,sizeof before);
            for(new i;i<g_business_loaded;i++) if(GetBusinessData(i,B_SQL_ID)==recordid) {index=i;break;}
            if(index<0||strcmp(g_business[index][B_NAME],before)) code="cache_mismatch";
            if(count!=1||strlen(after)<1||strlen(after)>29) code="invalid_name";
        }
        case 3:
        {
            old1=cache_get_field_content_int(0,"color_1",UUW_DB);old2=cache_get_field_content_int(0,"color_2",UUW_DB);
            if(!has1)c1=old1;if(!has2)c2=old2;
            if(count!=has1+has2||count<1||c1<0||c1>255||c2<0||c2>255||cache_get_field_content_int(0,"famcar",UUW_DB)) code="invalid_colours";
            for(new i;i<MAX_OWNABLE_CARS;i++) if(GetOwnableCarData(i,OC_SQL_ID)==recordid&&!GetOwnableCarData(i,OC_FAM_CAR)&&GetOwnableCarData(i,OC_CREATE)) {index=i;break;}
            // Unloaded vehicles are rejected: a queued load callback could
            // otherwise restore pre-edit colours after the database commit.
            if(index<0) code="vehicle_not_loaded";
            else if(GetOwnableCarData(index,OC_COLOR_1)!=old1||GetOwnableCarData(index,OC_COLOR_2)!=old2) code="cache_mismatch";
        }
        case 4:
        {
            old1=cache_get_field_content_int(0,"locked",UUW_DB);
            for(new i;i<g_apartment_loaded;i++) if(GetApartmentData(i,AP_SQL_ID)==recordid) {index=i;break;}
            if(index<0||GetApartmentData(index,AP_LOCKED)!=old1) code="cache_mismatch";
            if(count!=1||(locked!=0&&locked!=1)) code="invalid_lock";
        }
    }
    cache_delete(result,UUW_DB);
    if(strcmp(code,"applied")) return UUW_Finish(id,actor,code);
    // Name conversion must round-trip CP1251; never store '?' substitutions.
    if(kind==1||kind==2)
    {
        result=mysql_query(UUW_DB,"SELECT BINARY CONVERT(CONVERT(JSON_UNQUOTE(JSON_EXTRACT(@uu_changes,'$.name.after')) USING cp1251) USING utf8mb4)=BINARY JSON_UNQUOTE(JSON_EXTRACT(@uu_changes,'$.name.after')) AND JSON_UNQUOTE(JSON_EXTRACT(@uu_changes,'$.name.after')) NOT REGEXP '[[:cntrl:]{}]' AND INSTR(JSON_UNQUOTE(JSON_EXTRACT(@uu_changes,'$.name.after')),CHAR(34))=0 AND INSTR(JSON_UNQUOTE(JSON_EXTRACT(@uu_changes,'$.name.after')),CHAR(92))=0 ok",true);
        if(mysql_errno(UUW_DB))return UUW_Stop();
        new valid=cache_get_field_content_int(0,"ok",UUW_DB);cache_delete(result,UUW_DB);
        if(!valid)return UUW_Finish(id,actor,"invalid_encoding");
    }
    switch(kind)
    {
        case 0:mysql_format(UUW_DB,UUW_SQL,sizeof UUW_SQL,"UPDATE accounts_1101 SET skin=%d WHERE id=%d",skin,recordid);
        case 1,2:mysql_format(UUW_DB,UUW_SQL,sizeof UUW_SQL,"UPDATE `%s` SET name='%e' WHERE id=%d",UUW_Tables[kind],after,recordid);
        case 3:mysql_format(UUW_DB,UUW_SQL,sizeof UUW_SQL,"UPDATE ownable_cars SET color_1=%d,color_2=%d WHERE id=%d AND famcar=0",c1,c2,recordid);
        case 4:mysql_format(UUW_DB,UUW_SQL,sizeof UUW_SQL,"UPDATE appartaments_ap SET locked=%d WHERE id=%d",locked,recordid);
    }
    result=mysql_query(UUW_DB,UUW_SQL,true);
    if(mysql_errno(UUW_DB))return UUW_Stop();
    new changed=cache_affected_rows(UUW_DB),warnings=cache_warning_count(UUW_DB);cache_delete(result,UUW_DB);
    if(changed!=1||warnings)return UUW_Stop();
    if(!UUW_Finish(id,actor,"applied"))return 0;
    // COMMIT succeeded; sync cached values before the next game callback runs.
    switch(kind)
    {
        case 1:format(g_house[index][H_NAME],20,"%s",after);
        case 2:format(g_business[index][B_NAME],30,"%s",after);
        case 3:if(index>=0) {SetOwnableCarData(index,OC_COLOR_1,c1);SetOwnableCarData(index,OC_COLOR_2,c2);new vehicleid=GetOwnableCarData(index,OC_VEHID);if(IsValidVehicle(vehicleid))ChangeVehicleColor(vehicleid,c1,c2);}
        case 4:SetApartmentData(index,AP_LOCKED,locked);
    }
    return 1;
}
stock UUW_Finish(const id[],actor,const code[])
{
    new status[12];format(status,sizeof status,"%s",!strcmp(code,"applied")?"applied":"rejected");
    mysql_format(UUW_DB,UUW_SQL,sizeof UUW_SQL,"UPDATE site_admin_changes SET status='%e',active_target=NULL WHERE id='%e' AND status='queued'",status,id);
    if(!UUW_Exec(UUW_SQL))return 0;
    mysql_format(UUW_DB,UUW_SQL,sizeof UUW_SQL,"UPDATE site_admin_dispatch SET finished_at=UTC_TIMESTAMP(),result_code='%e',instance_id='%e' WHERE change_id='%e'",code,UUW_Instance,id);
    if(!UUW_Exec(UUW_SQL))return 0;
    mysql_format(UUW_DB,UUW_SQL,sizeof UUW_SQL,"INSERT INTO site_admin_audit(change_id,actor_id,event,reason) VALUES('%e',%d,'%e','bridge-v1:%e')",id,actor,status,code);
    if(!UUW_Exec(UUW_SQL))return 0;
    return UUW_Exec("COMMIT");
}

public OnGameModeExit()
{
    if(UUW_Timer) KillTimer(UUW_Timer);
    if(UUW_DB && UUW_DB!=mysql) mysql_close(UUW_DB);
    #if defined UUW_OnGameModeExit
        return UUW_OnGameModeExit();
    #else
        return 1;
    #endif
}
#if defined _ALS_OnGameModeExit
    #undef OnGameModeExit
#else
    #define _ALS_OnGameModeExit
#endif
#if defined UUW_OnGameModeExit
    forward UUW_OnGameModeExit();
#endif
#define OnGameModeExit UUW_OnGameModeExit
