Date: 02/19/2026

1. fix the highlights and comments bug in dashboard label view page; it will require a new migrate to make the project_id in labelAnnotation table nullable;
2. 

Date: 02/20/2026
1. in xml_handling, do not show "<code code="48780-1" codeSystem="2.16.840.1.113883.6.1" displayName="SPL listing data elements section"/>" as a separated page/section, if it appears; this section is used about what product/info was included in the spl, so we need a different strategy to process it instead of treating it as a regular labeling section. 
2. re-design the layout of the label view page, the first layer should be the functions (label/faer/agents); the layout will be drug meta-data, function panels, and placeholder for the detailed function. The second layer will be inside the label panel, including menu and main content. The third layer will be the main content in label panel, which will look like a "book", we do not require each section only have one page, if it is a long section should be presented in multiple pages.
3. re-design of the agent panel; particularly for tox agent, it should displayed in a way that we are consolidating multiple sources together, we will elaborate this idea later.