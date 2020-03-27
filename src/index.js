import fs from 'fs'
import path from 'path'
import got from 'got'
import { camelCase } from 'change-case'

import {
    createHMAC, getSauceEndpoint, toString, getParameters,
    isValidType, createProxyAgent, getStrictSsl
} from './utils'
import {
    PROTOCOL_MAP, DEFAULT_OPTIONS, SYMBOL_INSPECT, SYMBOL_TOSTRING,
    SYMBOL_ITERATOR, TO_STRING_TAG
} from './constants'

export default class SauceLabs {
    constructor (options) {
        this._options = Object.assign({}, DEFAULT_OPTIONS, options)
        this.username = this._options.user
        this._accessKey = this._options.key
        this._api = got.extend({
            username: this.username,
            password: this._accessKey,
            rejectUnauthorized: getStrictSsl(),
            followRedirect: true,
        })

        if (this._options.proxy !== undefined) {
            var proxyAgent = createProxyAgent(this._options.proxy)
            this._api = got.extend({
                agent: proxyAgent
            }, this._api)
        }

        /**
         * public fields
         */
        this.region = this._options.region
        this.headless = this._options.headless

        return new Proxy({
            username: this.username,
            key: `XXXXXXXX-XXXX-XXXX-XXXX-XXXXXX${(this._accessKey || '').slice(-6)}`,
            region: this._options.region,
            headless: this._options.headless
        }, { get: ::this.get })
    }

    get (_, propName) {
        /**
         * print to string output
         * https://nodejs.org/api/util.html#util_util_inspect_custom
         */
        /* istanbul ignore next */
        if (propName === SYMBOL_INSPECT || propName === 'inspect') {
            return () => toString(this)
        }

        /**
         * print to string tag
         * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/toStringTag
         */
        if (propName === SYMBOL_TOSTRING) {
            return TO_STRING_TAG
        }

        /**
         * return instance iterator
         * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/iterator
         */
        if (propName === SYMBOL_ITERATOR) {
            return
        }

        /**
         * allow to return publicly registered class properties
         */
        if (this[propName]) {
            return !propName.startsWith('_') ? this[propName] : undefined
        }

        if (!PROTOCOL_MAP.has(propName)) {
            /**
             * just return if propName is a symbol (Node 8 and lower)
             */
            /* istanbul ignore next */
            if (typeof propName !== 'string') {
                return
            }
            throw new Error(`Couldn't find API endpoint for command "${propName}"`)
        }

        /**
         * handle special commands not defined in the protocol
         */
        if (propName === 'downloadJobAsset') {
            return ::this._downloadJobAsset
        }

        return async (...args) => {
            const { description, method, endpoint, host, basePath } = PROTOCOL_MAP.get(propName)
            const params = getParameters(description.parameters)
            const pathParams = params.filter(p => p.in === 'path')

            /**
             * validate required url params
             */
            let url = endpoint
            for (const [i, urlParam] of Object.entries(pathParams)) {
                const param = args[i]
                const type = urlParam.type.replace('integer', 'number')

                if (typeof param !== type) {
                    throw new Error(`Expected parameter for url param '${urlParam.name}' from type '${type}', found '${typeof param}'`)
                }

                url = url.replace(`{${urlParam.name}}`, param)
            }

            /**
             * check for body param (as last parameter as we don't expect request
             * parameters for non idempotent requests)
             */
            let bodyOption = params.find(p => p.in === 'body')
                ? args[pathParams.length]
                : null

            if (bodyOption && typeof bodyOption === 'string') {
                bodyOption = JSON.parse(bodyOption)
            }

            /**
             * validate required options
             */
            const bodyMap = new Map()
            const options = args.slice(pathParams.length)[0] || {}
            for (const optionParam of params.filter(p => p.in === 'query')) {
                const expectedType = optionParam.type.replace('integer', 'number')
                const optionName = camelCase(optionParam.name)
                const option = options[optionName]
                const isRequired = Boolean(optionParam.required) || (typeof optionParam.required === 'undefined' && typeof optionParam.default === 'undefined')
                if ((isRequired || option) && !isValidType(option, expectedType)) {
                    throw new Error(`Expected parameter for option '${optionName}' from type '${expectedType}', found '${typeof option}'`)
                }

                if (typeof option !== 'undefined') {
                    bodyMap.set(optionParam.name, option)
                }
            }

            /**
             * get request body by using the body parameter or convert the parameter
             * map into json object
             */
            const body = bodyOption || [...bodyMap.entries()].reduce((e, [k, v]) => {
                e[k] = v
                return e
            }, {})

            /**
             * make request
             */
            const uri = getSauceEndpoint(host + basePath, this._options.region, this._options.headless) + url
            try {
                const response = await this._api[method](uri, {
                    ...(
                        method === 'get'
                            ? { searchParams: body }
                            : { json: body }
                    ),
                    responseType: 'json'
                })

                return response.body
            } catch (err) {
                throw new Error(`Failed calling ${propName}: ${err.message}`)
            }
        }
    }

    async _downloadJobAsset (jobId, assetName, { filepath } = {}) {
        /**
         * check job id
         */
        if (typeof jobId !== 'string' || typeof assetName !== 'string') {
            throw new Error('You need to define a job id and the file name of the asset as a string')
        }

        const hmac = await createHMAC(this.username, this._accessKey, jobId)
        const host = getSauceEndpoint('saucelabs.com', this._options.region, this._options.headless, 'https://assets.')
        const responseType = assetName.endsWith('mp4') ? 'buffer' : 'text'
        const uri = `${host}/jobs/${jobId}/${assetName}?ts=${Date.now()}&auth=${hmac}`

        try {
            const res = await this._api.get(uri, { responseType })

            /**
             * parse asset as json if proper content type is given
             */
            if (res.headers['content-type'] === 'application/json' && typeof res.body === 'string') {
                res.body = JSON.parse(res.body)
            }

            /**
             * only pipe asset to file if path is given
             */
            if (typeof filepath === 'string') {
                let data = res.body
                const downloadPath = path.resolve(process.cwd(), filepath)
                const encoding = res.headers['content-type'] === 'application/json' ? 'utf8' : 'binary'

                if (res.headers['content-type'] === 'application/json') {
                    data = JSON.stringify(res.body, null, 4)
                }

                fs.writeFileSync(downloadPath, data, { encoding })
            }

            return res.body
        } catch (err) {
            throw new Error(`There was an error downloading asset ${assetName}: ${err.message}`)
        }
    }
}
