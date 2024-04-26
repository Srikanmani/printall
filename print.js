const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const fs = require("fs");
const htmlToPdf = require("html-pdf");
const { PDFDocument } = require("pdf-lib");

// Initialize WooCommerce API
const WooCommerce = new WooCommerceRestApi({
  url: 'https://staging2.vaseegrahveda.com/',
  consumerKey: 'ck_1cfb0c2ac1ce87466afd68488ad8b790239ebc2c',
  consumerSecret: 'cs_63b22c257d43ef3ee8d6d6747ab80ede38013f61',
  version: 'wc/v3'
});

// Function to fetch orders recursively
async function fetchOrders(offset = 0, allOrders = []) {
  try {
    // Fetch orders with 'processing' status and pagination
    const response = await WooCommerce.get("orders", {
      status: "processing",
      offset: offset
    });

    // Extract shipping details, customer name, and product names from each order
    const filteredOrders = response.data.map(order => {
      const customerName = order.billing.first_name + ' ' + order.billing.last_name;
      const productDetails = order.line_items.map(item => `${item.name} × ${item.quantity}`).join(', ');
      const shippingDetails = {
        orderId: order.id,
        customerName: customerName,
        shippingAddress: order.shipping.address_1,
        shippingCity: order.shipping.city,
        shippingState: order.shipping.state,
        shippingCountry: order.shipping.country,
        shippingPostcode: order.shipping.postcode,
        productsOrdered: productDetails,
        dateCreated: new Date(order.date_created).toLocaleDateString(), // Fetching correct date
        totalItems: order.line_items.reduce((acc, item) => acc + item.quantity, 0) // Calculating total items
      };
      return { shippingDetails };
    }).filter(order => !order.shippingDetails.productsOrdered.includes("Customer Note:"));

    // Concatenate the filtered orders with the existing orders
    allOrders = [...allOrders, ...filteredOrders];

    // If there are more orders to fetch, recursively call the function
    const totalPages = response.headers["x-wp-totalpages"];
    if (totalPages > offset / 10 + 1) { // assuming 10 orders per page
      return fetchOrders(offset + 10, allOrders);
    }

    // Return all fetched orders
    return allOrders;
  } catch (error) {
    console.error("Error fetching orders:", error);
    return []; // Return an empty array in case of an error
  }
}

// Function to generate HTML content for each order
function generateHtmlContent(order) {
  let lineItemsCount = order.line_items ? order.line_items.length : 0;
  return `
    <html>
    <head>
      <title>Order Details</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
          width: 4in;
          height: 4in;
        }

        .content {
          width: 100%;
          height: 100%;
          background-color: white;
          border: 3px solid black;
          padding: 5px;
          font-size: 10px;
        }

        .content p {
          font-size: 10px;
        }

        .content table {
          width: 100%;
          font-size: 10px;
          border-collapse: collapse;
        }

        .content table th,
        .content table td {
          border: 1px solid #ddd;
          padding: 5px;
          text-align: left;
        }

        .content table th {
          background-color: #f2f2f2;
        }

        h3, h2 {
          margin: 5px 0;
        }

        .seller-info {
          width: 50%;
        }

        .prepaid-info {
          width: 50%;
        }

        .products-info {
          width: 100%;
        }

        .to-label {
          font-weight: bold;
        }

        .order-id {
          margin-top: -5px;
        }
      </style>
    </head>
    <body>
      <div class="content">
        <h3>Ship Via: ST COURIER</h3>
        <h2 class="order-id" style="text-align: center;">Vaseegrah Veda Order ID ${order.shippingDetails.orderId}</h2>
        <table>
          <tr>
            <td class="to-label">To</td>
            <td>
              ${order.shippingDetails.customerName},<br>
              ${order.shippingDetails.shippingAddress},<br>
              ${order.shippingDetails.shippingCity},<br>
              ${order.shippingDetails.shippingState}, ${order.shippingDetails.shippingPostcode}.<br>
              ${order.shippingDetails.shippingCountry}<br>
            </td>
          </tr>
        </table>

        <table>
          <tbody>
            <tr>
              <td class="seller-info">
                <b>Seller:</b><br>
                <b>VASEEGRAH VEDA</b><br>
                No:7 VIJAYA NAGAR,<br>
                SRINIVASAPURAM (Post)<br>
                THANJAVUR<br>
                TAMIL NADU- 613009<br>
                MOBILE: 8248817165
              </td>
              <td class="prepaid-info">
                <b>Prepaid Order:</b><br>
                Date: ${order.shippingDetails.dateCreated}<br> <!-- Corrected date -->
                Weight: <br> <!-- Leave weight blank -->
                No.of Items: ${order.shippingDetails.totalItems}<br> <!-- Corrected total items -->
                Packed By: <br> <!-- Leave packed by blank -->
              </td>
            </tr>
            <tr>
              <td colspan='2' class="products-info">
                <strong>Products:</strong><br>
                ${order.shippingDetails.productsOrdered}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </body>
    </html>
    `;
}

// Function to generate PDF from HTML content
function generatePDF(htmlContent) {
  return new Promise((resolve, reject) => {
    htmlToPdf.create(htmlContent, { format: 'Letter' }).toBuffer((err, buffer) => {
      if (err) {
        reject(err);
      } else {
        resolve(buffer);
      }
    });
  });
}

// Function to update order notes
async function updateOrderNotes(orderId) {
  const note = "Your order has been printed. Shipping label is sent to the packing department";
  const response = await WooCommerce.post(`orders/${orderId}`, { customer_note: note });
  console.log(`Order note updated for order ID : ${orderId}`);
}

// Function to generate PDF for each order and update order notes
async function generatePDFAndUpdateNotes(orders) {
  const pdfBuffers = [];
  for (let i = 0; i < orders.length; i++) {
    // Generate PDF for each order
    const htmlContent = generateHtmlContent(orders[i]);
    const pdfBuffer = await generatePDF(htmlContent);
    pdfBuffers.push(pdfBuffer);

    // Update customer note for the order
    try {
      await updateOrderNotes(orders[i].shippingDetails.orderId);
    } catch (error) {
      console.error("Error updating order notes:", error);
    }
  }
  console.log("PDFs generated successfully and order notes updated.");

  // Merge individual PDFs into a single file
  const mergedFileName = "combined-orders.pdf";
  const mergedPdfDoc = await PDFDocument.create();
  for (let i = 0; i < pdfBuffers.length; i++) {
    const pdfDoc = await PDFDocument.load(pdfBuffers[i]);
    const copiedPages = await mergedPdfDoc.copyPages(pdfDoc, pdfDoc.getPageIndices());
    copiedPages.forEach((page) => mergedPdfDoc.addPage(page));
  }

  const mergedPdfBytes = await mergedPdfDoc.save();
  fs.writeFileSync(mergedFileName, mergedPdfBytes);
  console.log("Combined PDF file generated successfully.");
}

// Call the function to fetch orders
fetchOrders()
  .then(orders => {
    generatePDFAndUpdateNotes(orders);
  })
  .catch(error => {
    console.error("Error:", error);
  });
