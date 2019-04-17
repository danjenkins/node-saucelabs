import { createHMAC, getSauceEndpoint, toString, isValidType, getErrorReason, getStrictSsl } from '../src/utils'

test('createHMAC', async () => {
    expect(await createHMAC('foo', 'bar', 'loo123'))
        .toBe('b975a69fa344ed43e1035b0698788705')
})

test('getSauceEndpoint', () => {
    expect(getSauceEndpoint('saucelabs.com', 'us', false))
        .toBe('https://saucelabs.com')
    expect(getSauceEndpoint('saucelabs.com', 'I_DONT_EXIST', false))
        .toBe('https://us-west-1.saucelabs.com')
    expect(getSauceEndpoint('saucelabs.com', 'us', false, 'http://'))
        .toBe('http://saucelabs.com')
    expect(getSauceEndpoint('saucelabs.com', 'eu', false))
        .toBe('https://eu-central-1.saucelabs.com')
    expect(getSauceEndpoint('saucelabs.com', 'us', true))
        .toBe('https://us-east-1.saucelabs.com')
    expect(getSauceEndpoint('api.saucelabs.com', 'us', false))
        .toBe('https://api.us-west-1.saucelabs.com')
    expect(getSauceEndpoint('api.saucelabs.com', 'eu', false))
        .toBe('https://api.eu-central-1.saucelabs.com')
    expect(getSauceEndpoint('app.testobject.com', 'eu', false))
        .toBe('https://app.testobject.com')
    expect(getSauceEndpoint('app.testobject.com', 'us', false))
        .toBe('https://app.testobject.com')
})

test('toString', () => {
    expect(toString({
        username: 'foobar',
        _accessKey: '50fc1a11-3231-4240-9707-8f34682b17b0',
        _options: { region: 'us', headless: false }
    })).toBe(`SauceLabs API Client {
  user: 'foobar',
  key: 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXX2b17b0',
  region: 'us',
  headless: false
}`)
})

test('isValidType', () => {
    expect(isValidType(0, 'number')).toBe(true)
    expect(isValidType(1, 'number')).toBe(true)
    expect(isValidType('1', 'number')).toBe(false)
    expect(isValidType(['foo', 123], 'array')).toBe(true)
    expect(isValidType(null, 'array')).toBe(false)
})

test('getErrorReason', () => {
    expect(getErrorReason()).toBe('unknown')
    expect(getErrorReason({ message: 'foobar' })).toBe('foobar')
    expect(getErrorReason({ detail: 'barfoo' })).toBe('barfoo')
    expect(getErrorReason({ message: 'foobar', detail: 'barfoo' })).toBe('foobar')
    expect(getErrorReason('foobarloo')).toBe('foobarloo')
    expect(getErrorReason(['some reason', 'some other reason'])).toBe('some reason')
})

describe('getStrictSsl', () => {
    beforeEach(function() {
        delete process.env.STRICT_SSL
        delete process.env.strict_ssl
    })

    it('should return "false" when environment variable "STRICT_SSL" is defined with value "false"', () => {
        process.env['STRICT_SSL'] = 'false'
        expect(getStrictSsl()).toEqual(false)
    })

    it('should return "false" when environment variable "strict_ssl" is defined with value "false"', () => {
        process.env['strict_ssl'] = 'false'
        expect(getStrictSsl()).toEqual(false)
    })

    it('should return "true" when environment variable "STRICT_SSL" is defined with value "true"', () => {
        process.env['STRICT_SSL'] = 'true'
        expect(getStrictSsl()).toEqual(true)
    })

    it('should return "true" when environment variable "strict_ssl" is defined with value "true"', () => {
        process.env['strict_ssl'] = 'true'
        expect(getStrictSsl()).toEqual(true)
    })

    it('should return "true" when environment variable "STRICT_SSL" / "strict_ssl" is not defined', () => {
        expect(getStrictSsl()).toEqual(true)
    })

    it('should return "true" when environment variable "STRICT_SSL" is defined with any other value than "false"', () => {
        process.env['STRICT_SSL'] = 'foo'
        expect(getStrictSsl()).toEqual(true)
    })

    it('should return "true" when environment variable "strict_ssl" is defined with any other value than "false"', () => {
        process.env['strict_ssl'] = 'foo'
        expect(getStrictSsl()).toEqual(true)
    })
})
