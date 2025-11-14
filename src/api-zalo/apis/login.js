import { appContext } from "../context.js";
import { Zalo } from "../index.js";
import { decryptResp, getSignKey, makeURL, ParamsEncryptor, request } from "../utils.js";

async function requestWithRetry(url, options = {}, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000);
            
            const response = await request(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Referer': 'https://chat.zalo.me/',
                    ...options.headers
                }
            });
            
            clearTimeout(timeout);
            return response;
            
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            
            const delay = Math.pow(2, i) * 2000;
            console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms... Error: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

export async function login(encryptParams) {
    const encryptedParams = await getEncryptParam(appContext.imei, appContext.language, encryptParams, "getlogininfo");
    
    try {
        const response = await requestWithRetry(
            makeURL("https://wpa.chat.zalo.me/api/login/getLoginInfo", 
                Object.assign(Object.assign({}, encryptedParams.params), { nretry: 0 })
            )
        );
        
        if (!response.ok)
            throw new Error("Failed to fetch login info: " + response.statusText);
        
        const data = await response.json();
        
        if (encryptedParams.enk) {
            const decryptedData = decryptResp(encryptedParams.enk, data.data);
            return decryptedData != null && typeof decryptedData != "string" ? decryptedData : null;
        }
        
        return null;
    } catch (error) {
        console.error("Login error:", error);
        throw new Error("Failed to fetch login info: " + error.message);
    }
}

export async function getServerInfo(encryptParams) {
    const encryptedParams = await getEncryptParam(appContext.imei, appContext.language, encryptParams, "getserverinfo");
    
    try {
        const response = await requestWithRetry(
            makeURL("https://wpa.chat.zalo.me/api/login/getServerInfo", {
                imei: appContext.imei,
                type: Zalo.API_TYPE,
                client_version: Zalo.API_VERSION,
                computer_name: "Web",
                signkey: encryptedParams.params.signkey,
            })
        );
        
        if (!response.ok)
            throw new Error("Failed to fetch server info: " + response.statusText);
        
        const data = await response.json();
        
        if (data.data == null)
            throw new Error("Failed to fetch server info: " + data.error);
        
        return data.data;
    } catch (error) {
        console.error("Server info error:", error);
        throw new Error("Failed to fetch server info: " + error.message);
    }
}

async function getEncryptParam(imei, language, encryptParams, type) {
    const params = {};
    const data = {
        computer_name: "Web",
        imei,
        language,
        ts: Date.now(),
    };
    
    const encryptedData = await _encryptParam(data, encryptParams);
    
    if (encryptedData == null) {
        Object.assign(params, data);
    } else {
        const { encrypted_params, encrypted_data } = encryptedData;
        Object.assign(params, encrypted_params);
        params.params = encrypted_data;
    }
    
    params.type = Zalo.API_TYPE;
    params.client_version = Zalo.API_VERSION;
    params.signkey = type == "getserverinfo"
        ? getSignKey(type, {
            imei: appContext.imei,
            type: Zalo.API_TYPE,
            client_version: Zalo.API_VERSION,
            computer_name: "Web",
        })
        : getSignKey(type, params);
    
    return {
        params,
        enk: encryptedData ? encryptedData.enk : null,
    };
}

async function _encryptParam(data, encryptParams) {
    if (encryptParams) {
        const encryptor = new ParamsEncryptor({
            type: Zalo.API_TYPE,
            imei: data.imei,
            firstLaunchTime: Date.now(),
        });
        
        try {
            const stringifiedData = JSON.stringify(data);
            const encryptedKey = encryptor.getEncryptKey();
            const encodedData = ParamsEncryptor.encodeAES(encryptedKey, stringifiedData, "base64", false);
            const params = encryptor.getParams();
            
            return params
                ? {
                    encrypted_data: encodedData,
                    encrypted_params: params,
                    enk: encryptedKey,
                }
                : null;
        } catch (error) {
            throw new Error("Failed to encrypt params: " + error.message);
        }
    }
    
    return null;
}
