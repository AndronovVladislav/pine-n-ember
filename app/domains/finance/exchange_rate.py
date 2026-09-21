import ssl
import urllib.error
import urllib.request
from datetime import date
from decimal import Decimal
from xml.etree import ElementTree

import certifi

from app.domains.errors import ExternalServiceUnavailable

CBR_DAILY_URL = 'https://www.cbr.ru/scripts/XML_daily.asp'
BYN_CHAR_CODE = 'BYN'

# python-build-standalone (используется uv) не подхватывает системные корневые сертификаты macOS -
# без явного certifi.where() запрос падает с SSLCertVerificationError.
_SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())


def fetch_byn_to_rub_rate(on_date: date) -> Decimal:
    """Курс BYN->RUB на конкретную дату по данным ЦБ РФ."""
    url = f'{CBR_DAILY_URL}?date_req={on_date:%d/%m/%Y}'
    try:
        with urllib.request.urlopen(url, timeout=5, context=_SSL_CONTEXT) as response:
            root = ElementTree.fromstring(response.read())
    except (urllib.error.URLError, ElementTree.ParseError) as exc:
        raise ExternalServiceUnavailable('Не удалось получить курс валют от ЦБ РФ') from exc

    for valute in root.findall('Valute'):
        if valute.findtext('CharCode') == BYN_CHAR_CODE:
            nominal = Decimal(valute.findtext('Nominal'))
            value = Decimal(valute.findtext('Value').replace(',', '.'))
            return value / nominal

    raise ExternalServiceUnavailable('ЦБ РФ не публикует курс BYN на эту дату')
