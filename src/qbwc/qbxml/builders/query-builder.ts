export function buildCustomerQueryRq(cursor?: string): string {
  const filter = cursor ? `<FromModifiedDate>${cursor}</FromModifiedDate>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<?qbxml version="13.0"?>
<QBXML>
  <QBXMLMsgsRq onError="continueOnError">
    <CustomerQueryRq>${filter}</CustomerQueryRq>
  </QBXMLMsgsRq>
</QBXML>`;
}

export function buildInvoiceQueryRq(cursor?: string): string {
  const filter = cursor ? `<FromModifiedDate>${cursor}</FromModifiedDate>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<?qbxml version="13.0"?>
<QBXML>
  <QBXMLMsgsRq onError="continueOnError">
    <InvoiceQueryRq>${filter}</InvoiceQueryRq>
  </QBXMLMsgsRq>
</QBXML>`;
}

export function buildItemQueryRq(cursor?: string): string {
  const filter = cursor ? `<FromModifiedDate>${cursor}</FromModifiedDate>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<?qbxml version="13.0"?>
<QBXML>
  <QBXMLMsgsRq onError="continueOnError">
    <ItemQueryRq>${filter}</ItemQueryRq>
  </QBXMLMsgsRq>
</QBXML>`;
}

export function buildPaymentQueryRq(cursor?: string): string {
  const filter = cursor ? `<FromModifiedDate>${cursor}</FromModifiedDate>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<?qbxml version="13.0"?>
<QBXML>
  <QBXMLMsgsRq onError="continueOnError">
    <ReceivePaymentQueryRq>${filter}</ReceivePaymentQueryRq>
  </QBXMLMsgsRq>
</QBXML>`;
}
