export function buildCustomerAddRq(data: {
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<?qbxml version="13.0"?>
<QBXML>
  <QBXMLMsgsRq onError="stopOnError">
    <CustomerAddRq>
      <CustomerAdd>
        <Name>${escapeXml(data.name)}</Name>
        ${data.firstName ? `<FirstName>${escapeXml(data.firstName)}</FirstName>` : ""}
        ${data.lastName ? `<LastName>${escapeXml(data.lastName)}</LastName>` : ""}
        ${data.email ? `<Email>${escapeXml(data.email)}</Email>` : ""}
        ${data.phone ? `<Phone>${escapeXml(data.phone)}</Phone>` : ""}
      </CustomerAdd>
    </CustomerAddRq>
  </QBXMLMsgsRq>
</QBXML>`;
}

export function buildInvoiceAddRq(data: {
  customerRef: string;
  txnDate: string;
  lines: { itemRef: string; quantity: number; rate: number; description?: string }[];
}): string {
  const lineXml = data.lines
    .map((line, idx) => `      <InvoiceLineAdd>
        <ItemRef><ListID>${escapeXml(line.itemRef)}</ListID></ItemRef>
        <Desc>${escapeXml(line.description ?? "")}</Desc>
        <Quantity>${line.quantity}</Quantity>
        <Rate>${line.rate}</Rate>
      </InvoiceLineAdd>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?qbxml version="13.0"?>
<QBXML>
  <QBXMLMsgsRq onError="stopOnError">
    <InvoiceAddRq>
      <InvoiceAdd>
        <CustomerRef><ListID>${escapeXml(data.customerRef)}</ListID></CustomerRef>
        <TxnDate>${data.txnDate}</TxnDate>
${lineXml}
      </InvoiceAdd>
    </InvoiceAddRq>
  </QBXMLMsgsRq>
</QBXML>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
